'use client';
import Phase2Layout from '@/components/Phase2Layout';
import AttendanceManager from '@/components/AttendanceManager';
export default function AttendancePage(){return <Phase2Layout title="Batch attendance" roles={['owner','staff']}><AttendanceManager/></Phase2Layout>;}
