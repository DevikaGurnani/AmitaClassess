'use client';
import Phase2Layout from '@/components/Phase2Layout';
import Link from 'next/link';
import AttendanceManager from '@/components/AttendanceManager';
export default function AttendancePage(){return <Phase2Layout title="Batch attendance" roles={['owner','staff']}><Link className="secondary-button" href="/owner/pace">Teaching pace feedback</Link><AttendanceManager/></Phase2Layout>;}
