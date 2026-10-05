import SessionClient from './SessionClient';

export async function generateStaticParams() {
  return [{ id: 'default' }];
}

export default function Page() {
  return <SessionClient />;
}
