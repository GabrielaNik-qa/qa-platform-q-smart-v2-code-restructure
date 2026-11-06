import { onAuthStateChanged, type User } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { auth } from './firebase';
import { Home } from './Home';
import { SignIn } from './SignIn';

export function App() {
  const { t } = useTranslation();
  // undefined while Firebase is still checking whether this browser is signed in
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => onAuthStateChanged(auth, setUser), []);

  if (user === undefined) return <p className="p-8 text-mu">{t('common.loading')}</p>;
  // `key` gives every person a fresh page, so nothing of the previous person stays in memory after a sign-out
  return user ? <Home key={user.uid} user={user} /> : <SignIn />;
}
