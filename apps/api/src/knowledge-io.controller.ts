// Knowledge Base › Import and export (Phase 6, piece 3; today's import and ZIP export):
// - import: paste a text or upload a file (.txt, .md, .html, .docx); the text is split into draft articles at its
//   headings, or organised by the AI engine (focused articles, topics, a suggested folder: only no-training AI plans);
//   staff check and edit the drafts, then save them (missing folders are created);
// - a Word file is a ZIP: its table of contents says how big it becomes once unpacked, and a small file that would unpack to
//   hundreds of MB (a "zip bomb") is refused before anything is unpacked (at most 50 MB and 2,000 parts);
// - export: one article, or a folder with its sub-folders, as a ZIP of Markdown and HTML files, of what the person may see.
import { Body, Controller, HttpCode, Inject, Param, Post, Query, Res, StreamableFile, UseGuards } from '@nestjs/common';
import {
  addKbArticle,
  addKbFolder,
  type Db,
  getKbArticle,
  isDemoCompany,
  type KbArticle,
  type KbFolder,
  listKbArticles,
  listKbFolders,
  logActivity,
  type Membership,
  membershipOfUser,
  type Tx,
  withCompany,
} from '@qsmart/db';
import {
  can,
  type DraftArticle,
  fileSlug,
  folderSeen,
  folderTree,
  htmlToText,
  markdownToHtml,
  splitAtHeadings,
} from '@qsmart/shared';
import type { FastifyReply } from 'fastify';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import { z } from 'zod';
import { actorOf } from './activity.controller.js';
import { AiError, type AiEngine } from './ai/engine.js';
import { IMPORT_ARTICLES, importPrompt } from './ai/learning.js';
import { Allow, PermissionGuard } from './auth/permission.guard.js';
import { SignedInGuard } from './auth/signed-in.guard.js';
import { CompanyMemberGuard } from './company/company-member.guard.js';
import { CurrentMembership } from './decorators.js';
import { badRequest, notFound } from './errors.js';
import { AI_ENGINE, DB } from './tokens.js';

/** The largest file imported. */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
/** The most text read (the rest is left out). */
const MAX_TEXT = 200_000;
/** The most text sent to the AI in one go. */
const MAX_AI_TEXT = 30_000;
const id = z.uuid();

/** Whether a Word file would unpack too big (null: fine). Read from its table of contents, before anything is unpacked. */
export function docxProblem(buf: Buffer): 'damaged' | 'tooBig' | null {
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--)
    if (buf.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) return 'damaged';
  const parts = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  let total = 0;
  if (parts > 2000) return 'tooBig';
  for (let k = 0; k < parts; k++) {
    if (at + 46 > buf.length || buf.readUInt32LE(at) !== 0x02014b50) return 'damaged';
    const size = buf.readUInt32LE(at + 24);
    if (size === 0xffffffff) return 'tooBig';
    total += size;
    if (total > 50 * 1024 * 1024) return 'tooBig';
    at += 46 + buf.readUInt16LE(at + 28) + buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32);
  }
  return null;
}

const draft = z.object({
  title: z.string().trim().max(150).default(''),
  folder: z.string().trim().max(300).default(''),
  topics: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  body: z.string().max(200_000).default(''),
});
/** A suggested folder path as its names (at most 4 levels, each up to 60 characters). */
const pathNames = (path: string) =>
  path
    .split('/')
    .map((s) => s.trim().slice(0, 60))
    .filter(Boolean)
    .slice(0, 4);
const pathOf = (folders: KbFolder[], folderId: string | null) => {
  const names: string[] = [];
  for (let at = folders.find((f) => f.id === folderId), n = 0; at && n < 20; n++) {
    names.unshift(at.name);
    at = folders.find((f) => f.id === at?.parentId);
  }
  return names.join('/');
};

const zipName = (title: string) => `${fileSlug(title)}.zip`;
const front = (a: KbArticle) =>
  `---\ntitle: ${a.title}\ntopics: ${a.topics.join(', ')}\nauthor: ${a.authorName}\nupdated: ${a.updatedAt.toISOString()}\n---\n\n`;
function addArticleFiles(zip: JSZip, a: KbArticle, dir: string) {
  const name = fileSlug(a.title);
  zip.file(`${dir}${name}.md`, `${front(a)}# ${a.title}\n\n${a.body}\n`);
  const title = a.title.replace(/[<>&"]/g, '');
  zip.file(
    `${dir}${name}.html`,
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:760px;margin:40px auto;padding:0 16px;color:#1b2536}code{background:#f1f4f9;border-radius:6px;padding:2px 6px}blockquote{border-left:4px solid #cbd5e1;margin:0;padding-left:14px;color:#475569}</style></head><body><h1>${title}</h1>\n${markdownToHtml(a.body)}\n</body></html>`,
  );
}
async function sendZip(reply: FastifyReply, zip: JSZip, title: string) {
  const file = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  reply.header('Content-Type', 'application/zip');
  reply.header('Content-Disposition', `attachment; filename="${zipName(title)}"`);
  return new StreamableFile(file);
}

@Controller('kb')
@UseGuards(SignedInGuard, CompanyMemberGuard, PermissionGuard)
export class KnowledgeIoController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(AI_ENGINE) private readonly engine: AiEngine,
  ) {}

  /** The text becomes draft articles: split at its headings, or organised by the AI engine. */
  private async drafts(membership: Membership, text: string, filename: string, useAi: boolean) {
    const material = text.slice(0, MAX_TEXT);
    if (!material.trim()) throw badRequest('importEmpty');
    if (!useAi) return { ai: false, articles: splitAtHeadings(material, filename).slice(0, 60) };
    const prepared = await withCompany(this.db, membership.companyId, async (tx) => ({
      folders: pathsOf(await listKbFolders(tx)),
      dataClass: (await isDemoCompany(tx)) ? ('test' as const) : ('client' as const),
      byId: (await membershipOfUser(tx, membership.userId))?.id ?? null,
    }));
    try {
      const result = await this.engine.run({
        companyId: membership.companyId,
        dataClass: prepared.dataClass,
        byId: prepared.byId,
        type: IMPORT_ARTICLES,
        system: importPrompt(prepared.folders),
        prompt: `<material>\nFile name: ${filename}\n\n${material.slice(0, MAX_AI_TEXT)}\n</material>`,
      });
      const articles: DraftArticle[] = result.data.articles
        .map((a) => ({
          title: a.title.trim().slice(0, 150),
          folder: pathNames(a.folder).join('/'),
          topics: [...new Set(a.topics.map((t) => t.trim().slice(0, 40)).filter(Boolean))].slice(0, 5),
          body: a.body.trim(),
        }))
        .filter((a) => a.body);
      if (!articles.length) throw badRequest('importAiUnusable');
      return { ai: true, articles };
    } catch (e) {
      if (e instanceof AiError) throw badRequest(e.code, e.detail ? [e.detail] : undefined);
      throw e;
    }
  }

  @Post('import')
  @Allow('learning.write')
  @HttpCode(200)
  async importText(@CurrentMembership() membership: Membership, @Body() body: unknown) {
    const input = z
      .object({
        text: z.string().max(MAX_TEXT).default(''),
        filename: z.string().trim().max(150).default('Pasted text'),
        useAi: z.boolean().default(false),
      })
      .strict()
      .safeParse(body);
    if (!input.success) throw badRequest('importEmpty');
    return this.drafts(membership, input.data.text, input.data.filename, input.data.useAi);
  }

  /** A file, sent as it is (.txt, .md, .html or .docx): its name and "useAi" come in the address. */
  @Post('import/file')
  @Allow('learning.write')
  @HttpCode(200)
  async importFile(
    @CurrentMembership() membership: Membership,
    @Query() query: Record<string, string>,
    @Body() body: unknown,
  ) {
    const params = z
      .object({ filename: z.string().trim().min(1).max(150), useAi: z.enum(['true', 'false']).default('false') })
      .safeParse(query);
    if (!params.success || !Buffer.isBuffer(body) || body.length === 0) throw badRequest('importEmpty');
    if (body.length > MAX_IMPORT_BYTES) throw badRequest('importTooBig');
    const ext = /\.([a-z0-9]+)$/i.exec(params.data.filename)?.[1]?.toLowerCase() ?? '';
    let text: string;
    if (ext === 'docx') {
      const problem = docxProblem(body);
      if (problem) throw badRequest(problem === 'tooBig' ? 'importTooBig' : 'importDamaged');
      // read as HTML, so the headings survive and the document can be split at them
      text = htmlToText((await mammoth.convertToHtml({ buffer: body }).catch(() => ({ value: '' }))).value);
      if (!text.trim()) throw badRequest('importDamaged');
    } else if (ext === 'html' || ext === 'htm') text = htmlToText(body.toString('utf8'));
    else if (['txt', 'md', 'markdown'].includes(ext)) text = body.toString('utf8');
    else throw badRequest('importUnsupported');
    return this.drafts(membership, text, params.data.filename, params.data.useAi === 'true');
  }

  /** Saves the checked drafts as articles; the folders they name are created when they are missing. */
  @Post('import/save')
  @Allow('learning.write')
  @HttpCode(200)
  async save(@CurrentMembership() membership: Membership, @Body() body: unknown) {
    const input = z
      .object({ articles: z.array(draft).min(1).max(60), folderId: z.uuid().nullable().default(null) })
      .strict()
      .safeParse(body);
    if (!input.success) throw badRequest('importEmpty');
    return withCompany(this.db, membership.companyId, async (tx) => {
      const folders = await listKbFolders(tx);
      if (input.data.folderId && !folders.some((f) => f.id === input.data.folderId)) throw badRequest('kbInvalid');
      const me = await membershipOfUser(tx, membership.userId);
      const ids: string[] = [];
      for (const a of input.data.articles) {
        const folderId = await ensurePath(tx, folders, pathNames(a.folder), input.data.folderId, membership.userName);
        ids.push(
          await addKbArticle(
            tx,
            {
              folderId,
              title: a.title || 'Untitled',
              emoji: '',
              topics: [...new Set(a.topics)].slice(0, 10),
              body: a.body,
              reqOn: false,
              reqTeams: [],
              quiz: null,
            },
            { id: me?.id ?? null, name: membership.userName },
          ),
        );
      }
      await logActivity(tx, actorOf(membership), {
        action: 'kbImported',
        targetName: String(ids.length),
        details: { count: String(ids.length) },
      });
      return { created: ids.length, ids };
    });
  }

  // ------------------------------------------------------------------------------------------ export

  @Post('articles/:id/export')
  @Allow('learning.read')
  @HttpCode(200)
  async exportArticle(
    @CurrentMembership() membership: Membership,
    @Param('id') articleId: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    if (!id.safeParse(articleId).success) throw notFound('kbArticleNotFound');
    const found = await withCompany(this.db, membership.companyId, async (tx) => {
      const me = await membershipOfUser(tx, membership.userId);
      const article = await getKbArticle(tx, articleId);
      const folders = await listKbFolders(tx);
      const viewer = { staff: can(membership.role, 'learning.write'), teamId: me?.teamId ?? null };
      return article && folderSeen(folders, article.folderId, viewer) ? article : null;
    });
    if (!found) throw notFound('kbArticleNotFound');
    const zip = new JSZip();
    addArticleFiles(zip, found, '');
    return sendZip(reply, zip, found.title);
  }

  /** A folder with its sub-folders: the articles this person may see, in folders named like the folders. */
  @Post('folders/:id/export')
  @Allow('learning.read')
  @HttpCode(200)
  async exportFolder(
    @CurrentMembership() membership: Membership,
    @Param('id') folderId: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    if (!id.safeParse(folderId).success) throw notFound('kbFolderNotFound');
    const found = await withCompany(this.db, membership.companyId, async (tx) => {
      const me = await membershipOfUser(tx, membership.userId);
      const folders = await listKbFolders(tx);
      const viewer = { staff: can(membership.role, 'learning.write'), teamId: me?.teamId ?? null };
      const root = folders.find((f) => f.id === folderId);
      if (!root || !folderSeen(folders, folderId, viewer)) return null;
      return { root, folders, articles: await listKbArticles(tx), viewer };
    });
    if (!found) throw notFound('kbFolderNotFound');
    const zip = new JSZip();
    const inside = folderTree(found.folders, found.root.id);
    const facts = found.folders;
    const dirOf = (fid: string | null): string => {
      const names: string[] = [];
      for (
        let at = facts.find((f) => f.id === fid);
        at && at.id !== found.root.parentId;
        at = facts.find((f) => f.id === at?.parentId)
      )
        names.unshift(fileSlug(at.name));
      return `${names.join('/')}/`;
    };
    for (const a of found.articles)
      if (a.folderId && inside.has(a.folderId) && folderSeen(facts, a.folderId, found.viewer))
        addArticleFiles(zip, a, dirOf(a.folderId));
    return sendZip(reply, zip, found.root.name);
  }
}

const pathsOf = (folders: KbFolder[]) => folders.map((f) => pathOf(folders, f.id));

/** The folder a path names under a root, creating what is missing (like today: matched by name, ignoring case). */
async function ensurePath(
  tx: Tx,
  known: KbFolder[],
  names: string[],
  root: string | null,
  by: string,
): Promise<string | null> {
  let parent = root;
  for (const name of names) {
    let folder = known.find((f) => f.parentId === parent && f.name.toLowerCase() === name.toLowerCase());
    if (!folder) {
      const created = await addKbFolder(
        tx,
        {
          parentId: parent,
          name,
          colour: '#2563eb',
          icon: '📁',
          description: '',
          reqOn: false,
          reqTeams: [],
          teams: [],
        },
        by,
      );
      folder = {
        id: created,
        parentId: parent,
        name,
        colour: '#2563eb',
        icon: '📁',
        description: '',
        reqOn: false,
        reqTeams: [],
        teams: [],
        byName: by,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      known.push(folder);
    }
    parent = folder.id;
  }
  return parent;
}
