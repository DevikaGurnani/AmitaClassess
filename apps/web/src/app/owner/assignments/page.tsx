'use client';
import Phase2Layout from '@/components/Phase2Layout';
import AssignmentsPanel from '@/components/AssignmentsPanel';
export default function AssignmentsPage(){return <Phase2Layout title="Assignments" roles={['owner']}><AssignmentsPanel owner/></Phase2Layout>;}
