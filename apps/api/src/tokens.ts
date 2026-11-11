// The names under which the server's parts are handed to each other. Every injection names its part explicitly
// (@Inject(...)), so nothing depends on hidden type information and the tests can swap parts freely.
export const DB = Symbol('DB');
export const TOKEN_VERIFIER = Symbol('TOKEN_VERIFIER');
export const AI_ENGINE = Symbol('AI_ENGINE');
export const MASTER_KEY = Symbol('MASTER_KEY');
