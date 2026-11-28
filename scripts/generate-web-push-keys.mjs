import { generateKeyPairSync } from 'node:crypto';

// Run locally once. Treat the printed private key as a secret; never commit the output.
const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pub = publicKey.export({ format: 'jwk' });
const priv = privateKey.export({ format: 'jwk' });
const point = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, 'base64url'), Buffer.from(pub.y, 'base64url')]);
console.log(`WEB_PUSH_PUBLIC_KEY=${point.toString('base64url')}`);
console.log(`WEB_PUSH_PRIVATE_KEY=${priv.d}`);
console.log('Set WEB_PUSH_SUBJECT separately to a mailto: contact or an HTTPS URL you control.');
