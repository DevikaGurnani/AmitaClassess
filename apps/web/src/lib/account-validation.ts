export const temporaryPassword = '123456';
export function loginIdentity(value: string): { email: string } | { phone: string } {
  const input = value.trim();
  if (input.includes('@')) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input)) throw new Error('Enter a valid email address.');
    return { email: input.toLowerCase() };
  }
  const digits = input.replace(/[\s()-]/g, '');
  const phone = /^\d{10}$/.test(digits) ? `+91${digits}` : digits;
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new Error('Enter a valid 10-digit mobile number.');
  return { phone };
}
export function validateNewPassword(password: string, confirmation: string) {
  if (password === temporaryPassword || password.length < 8) throw new Error('Choose a new password with at least 8 characters.');
  if (password !== confirmation) throw new Error('Passwords do not match.');
}
export function validateAccount(input: Record<string, unknown>) {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const emailInput = typeof input.email === 'string' ? input.email : '';
  const email = loginIdentity(emailInput);
  const phone = loginIdentity(typeof input.phone === 'string' ? input.phone : '');
  const role = typeof input.role === 'string' ? input.role : '';
  if (!name || name.length > 150 || !('email' in email) || !('phone' in phone) || !['owner','staff','teacher','parent','student'].includes(role)) throw new Error('Name, email, mobile number and a valid role are required.');
  return { name, email: email.email, phone: phone.phone, role };
}
