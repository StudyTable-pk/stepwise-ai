import ReportClient from './ReportClient';

export async function generateStaticParams() {
  return [{ sessionId: 'default' }];
}

export default function Page() {
  return <ReportClient />;
}
