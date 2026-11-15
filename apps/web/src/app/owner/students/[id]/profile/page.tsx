import StudentEditor from '@/components/StudentEditor';
export default function Page({ params }: { params: { id: string } }) {
  return <StudentEditor studentId={params.id} />;
}
