'use strict';

/**
 * Нормализует телефонный номер к формату 7XXXXXXXXXX (11 цифр).
 * Например: +7 (999) 123-45-67 -> 79991234567
 *           8-999-123-45-67   -> 79991234567
 *           внутренний номер 211 -> 211 (оставляем как есть)
 */
function normPhone(raw) {
  if (!raw) return raw;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length < 5) return raw; // внутренний номер АТС — не трогаем
  if (digits.length === 11 && digits[0] === '8') return '7' + digits.slice(1);
  return digits;
}

module.exports = { normPhone };
