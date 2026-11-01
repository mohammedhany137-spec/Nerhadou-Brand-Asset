'use strict';

/* The nightly copy of the database leaves the site encrypted, so a Blob bucket that
 * is browsed by the wrong person still shows nothing.
 *
 *   NHUB1 | 12-byte iv | 16-byte gcm tag | ciphertext
 *
 * The key is derived from SESSION_SECRET with HKDF-SHA256 and never stored; the same
 * file cannot be read if that secret is rotated, which is why the manual 💾 download
 * (plain JSON, only for the Marketing Director) stays the everyday way back.
 */
const crypto = require('crypto');
const { secret } = require('./core');

const MAGIC = Buffer.from('NHUB1');

function key() {
  return Buffer.from(crypto.hkdfSync('sha256', Buffer.from(secret()), Buffer.from('nerhadou-backup'), Buffer.from('v1'), 32));
}

function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), body]);
}

function decrypt(buf) {
  const b = Buffer.from(buf);
  if (b.length < 33 || !b.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('not an encrypted Hub backup');
  const d = crypto.createDecipheriv('aes-256-gcm', key(), b.subarray(5, 17));
  d.setAuthTag(b.subarray(17, 33));
  return Buffer.concat([d.update(b.subarray(33)), d.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt };
