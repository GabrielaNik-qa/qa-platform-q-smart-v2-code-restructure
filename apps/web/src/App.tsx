import { onAuthStateChanged, type User } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { auth } from './firebase';
import { Home } from './Home';
import { QLoader } from './QLoader';
import { SignIn } from './SignIn';

export function App() {
  // undefined while Firebase is still checking whether this browser is signed in
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => onAuthStateChanged(auth, setUser), []);

  // today's heartbeat while the app opens (the home page keeps it until its data is there)
  if (user === undefined) return <QLoader on />;
  // `key` gives every person a fresh page, so nothing of the previous person stays in memory after a sign-out
  return user ? <Home key={user.uid} user={user} /> : <SignIn />;
}
