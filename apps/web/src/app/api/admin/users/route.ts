import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { temporaryPassword, validateAccount } from '@/lib/account-validation';
import {assignmentActor,assignmentErrorResponse,AssignmentError,assignmentUuid,assignmentStorage} from '@/lib/assignment-server';
export async function PATCH(request:Request){try{const {sb,user}=await assignmentActor(request,['owner']),body=await request.json();if(!assignmentUuid(body.id))throw new AssignmentError('Choose a valid account.');const {data:old,error}=await sb.from('users').select('id,name,email,phone,role,status').eq('id',body.id).single();if(error||!old)throw new AssignmentError('Account not found.',404);const account=validateAccount({...body,role:old.role}),status=String(body.status||'active');if(!['active','inactive'].includes(status)||(old.id===user.id&&status!=='active'))throw new AssignmentError('You cannot deactivate your own account.');const admin=assignmentStorage();let changed=false;if(account.email!==old.email){const result=await admin.auth.admin.updateUserById(old.id,{email:account.email,email_confirm:true});if(result.error)throw new AssignmentError(result.error.message);changed=true;}const result=await sb.rpc('edit_academy_account',{p_id:old.id,p_name:account.name,p_email:account.email,p_phone:account.phone,p_status:status});if(result.error){if(changed){const rollback=await admin.auth.admin.updateUserById(old.id,{email:old.email,email_confirm:true});if(rollback.error)throw new AssignmentError('Profile update failed and email restoration needs owner review.',500);}throw new AssignmentError(result.error.message);}return NextResponse.json({account:result.data});}catch(error){return assignmentErrorResponse(error);}}
export async function POST(request: Request) {
  // Reject cross-origin form submissions before doing privileged work.
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  try {
    const client = createServerSupabaseClient();
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
    if (user.app_metadata.must_change_password) return NextResponse.json({ error: 'Change your password first.' }, { status: 403 });
    const { data: actor } = await client.from('users').select('role,status').eq('id', user.id).single();
    if (actor?.role !== 'owner' || actor.status !== 'active') return NextResponse.json({ error: 'Only an active owner can create accounts.' }, { status: 403 });
    let account;
    let studentId: string | undefined;
    let teachingScopes:Array<{batch_id:string;subject_ids:string[]}> = [];
    try {
      const body = await request.json();
      account = validateAccount(body);
      if(account.role==='teacher'){
        if(!Array.isArray(body.teaching_scopes)||!body.teaching_scopes.length||body.teaching_scopes.length>100)throw new Error('Assign at least one batch and subject to the teacher.');
        teachingScopes=body.teaching_scopes;
        if(teachingScopes.some(scope=>!assignmentUuid(scope.batch_id)||!Array.isArray(scope.subject_ids)||!scope.subject_ids.length||scope.subject_ids.some(id=>!assignmentUuid(id))))throw new Error('Choose valid teaching batches and subjects.');
        const {data:allowed,error:scopeError}=await client.from('batch_subjects').select('batch_id,subject_id');
        if(scopeError||teachingScopes.some(scope=>scope.subject_ids.some(id=>!allowed?.some(row=>row.batch_id===scope.batch_id&&row.subject_id===id))))throw new Error('Subjects must belong to the selected batch.');
      }
      if (body.student_id !== undefined) {
        if (account.role !== 'student' || typeof body.student_id !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.student_id)) throw new Error('Invalid student link');
        studentId = body.student_id;
      }
    }
    catch { return NextResponse.json({ error: 'Name, valid email, mobile number and role are required.' }, { status: 400 }); }
    if (studentId) {
      const { data: student, error: studentError } = await client.from('students').select('id,name,email,phone').eq('id', studentId).single();
      if (studentError || !student) return NextResponse.json({ error: 'Save the student admission before creating its login. Check the student-contact migration.' }, { status: 400 });
      if (student.email?.toLowerCase() !== account.email || student.phone !== account.phone || student.name !== account.name) return NextResponse.json({ error: 'Login details must match the saved student admission.' }, { status: 409 });
      const { data: existing, error: existingError } = await client.from('users').select('id,name,email,phone,role,status,student_id').eq('student_id', studentId).maybeSingle();
      if (existingError) return NextResponse.json({ error: 'Unable to check existing student login. Contact the administrator.' }, { status: 409 });
      if (existing) {
        if (existing.role !== 'student' || existing.status !== 'active' || existing.email?.toLowerCase() !== account.email || existing.phone !== account.phone) return NextResponse.json({ error: 'A different or inactive account is already linked. Review People & permissions.' }, { status: 409 });
        return NextResponse.json({ account: existing, alreadyExists: true });
      }
    }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return NextResponse.json({ error: 'Account creation needs the server service-role key.' }, { status: 503 });
    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error: createError } = await admin.auth.admin.createUser({ email: account.email, password: temporaryPassword, email_confirm: true, app_metadata: { must_change_password: true } });
    if (createError) return NextResponse.json({ error: createError.message }, { status: 400 });
    const { data: profile, error: profileError } = await admin.from('users').insert({ id: data.user.id, ...account, ...(studentId ? { student_id: studentId } : {}), status: 'active' }).select('id,name,email,phone,role,status,student_id').single();
    if (profileError) {
      const { error: rollbackError } = await admin.auth.admin.deleteUser(data.user.id);
      return NextResponse.json({ error: rollbackError ? 'Profile setup and rollback failed. Contact the administrator before retrying.' : 'Profile setup failed. Check migrations and duplicate email/mobile details.' }, { status: 500 });
    }
    if(account.role==='teacher'){
      const {error:scopeError}=await client.rpc('assign_new_teacher_scopes',{p_teacher:data.user.id,p_scopes:teachingScopes});
      if(scopeError){const rollback=await admin.auth.admin.deleteUser(data.user.id);return NextResponse.json({error:rollback.error?'Teacher setup failed and account cleanup needs owner review.':'Teacher setup failed. No account was retained; check batch/subject selection.'},{status:400});}
    }
    return NextResponse.json({ account: profile }, { status: 201 });
  } catch { return NextResponse.json({ error: 'Unable to create account.' }, { status: 500 }); }
}
