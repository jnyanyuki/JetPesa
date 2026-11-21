'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function DedicatedGameRoute() {
  const router = useRouter();
  const params = useParams();
  const gameId = params?.gameId;
  const target = (typeof gameId === 'string' ? gameId : '').toLowerCase();

  useEffect(() => {
    if (target === 'lobby' || target === 'all' || !target) {
      router.replace('/games');
    } else {
      router.replace(`/dashboard?game=${encodeURIComponent(target)}`);
    }
  }, [target, router]);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: '#020617',
      color: '#38bdf8',
      fontFamily: 'sans-serif',
      fontSize: '14px',
      fontWeight: '700'
    }}>
      Loading JetPesa {target ? target.toUpperCase() : ''}...
    </div>
  );
}
