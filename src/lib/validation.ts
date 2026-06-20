/**
 * Validation utilities for form data and API responses
 */

export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Validate email format
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate password strength
 */
export function validatePassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (password.length < 8) {
    errors.push('يجب أن تكون كلمة المرور 8 أحرف على الأقل');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('يجب أن تحتوي على حرف كبير واحد على الأقل');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('يجب أن تحتوي على حرف صغير واحد على الأقل');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('يجب أن تحتوي على رقم واحد على الأقل');
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * Validate phone number
 */
export function validatePhone(phone: string): boolean {
  const phoneRegex = /^(\+\d{1,3}[- ]?)?\d{10,}$/;
  return phoneRegex.test(phone.replace(/\s/g, ''));
}

/**
 * Validate required field
 */
export function validateRequired(value: unknown): boolean {
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  return value !== null && value !== undefined;
}

/**
 * Validate amount (positive number)
 */
export function validateAmount(amount: unknown): boolean {
  const num = Number(amount);
  return !isNaN(num) && num > 0;
}

/**
 * Validate date format
 */
export function validateDate(date: string): boolean {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) return false;
  
  const d = new Date(date);
  return d instanceof Date && !isNaN(d.getTime());
}

/**
 * Validate form data
 */
export function validateFormData(
  data: Record<string, unknown>,
  schema: Record<string, (value: unknown) => boolean>
): ValidationError[] {
  const errors: ValidationError[] = [];
  
  Object.entries(schema).forEach(([field, validator]) => {
    if (!validator(data[field])) {
      errors.push({
        field,
        message: `حقل ${field} غير صحيح`,
      });
    }
  });
  
  return errors;
}
