const Transaction = require('../src/transaction');
const PeerId = require('peer-id');

describe('Transaction', () => {
  let peerId;
  let transaction;

  beforeAll((done) => {
    PeerId.createFromPrivKey(require('../keys/peer2').privKey, (err, id) => {
      peerId = id;
      done();
    });
  });

  beforeEach(async () => {
    transaction = new Transaction({ state: { storage: { key: 'value' } } });
    await transaction.sign(peerId);
  });

  test('is valid', async () => {
    await expect(transaction.verify()).resolves.toBe(true);
  });

  test('is not valid with modified content', async () => {
    transaction.message = 'hello';
    await expect(transaction.verify()).resolves.toBe(false);
  });

  test('is not valid with modified hash', async () => {
    transaction.hash = 'hash';
    await expect(transaction.verify()).resolves.toBe(false);
  });

  test('is not valid with modified signature', async () => {
    transaction.signature = 'signature';
    await expect(transaction.verify()).resolves.toBe(false);
  });

  test('hash and signature is ignored when calculating hash', () => {
    const hash1 = transaction.calculateHash();
    transaction.hash = 'hash';
    transaction.signature = 'signature';
    const hash2 = transaction.calculateHash();
    expect(hash1).toEqual(hash2);
  });
});
