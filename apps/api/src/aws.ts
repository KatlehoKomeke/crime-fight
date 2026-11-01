import { createHash, createHmac } from 'node:crypto'
import { SignatureV4 } from '@smithy/signature-v4'

type SourceData = string | ArrayBuffer | ArrayBufferView
const bytes = (data: SourceData) =>
  typeof data === 'string' ? data : ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : new Uint8Array(data)

/** SHA-256 for SigV4 on node:crypto (what @smithy/hash-node does, without the dependency). */
class Sha256 {
  private readonly hash
  constructor(secret?: SourceData) {
    this.hash = secret ? createHmac('sha256', bytes(secret)) : createHash('sha256')
  }
  update(data: SourceData) {
    this.hash.update(bytes(data))
  }
  digest() {
    return Promise.resolve(new Uint8Array(this.hash.digest()))
  }
}

/** Signs AWS requests as the Lambda's own IAM role, so calls to AWS need no SDK. */
export function lambdaSigner(service: string, region: string) {
  return new SignatureV4({
    service,
    region,
    sha256: Sha256,
    // Lambda puts the execution role's temporary credentials in the environment.
    credentials: () =>
      Promise.resolve({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
        sessionToken: process.env.AWS_SESSION_TOKEN,
      }),
  })
}
