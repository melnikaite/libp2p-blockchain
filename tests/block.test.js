const Transaction = require('../src/transaction');
const Block = require('../src/block');
const PeerId = require('peer-id');

describe('Block', () => {
  let peerId;
  let block;

  beforeAll((done) => {
    PeerId.createFromPrivKey(require('../keys/peer2').privKey, (err, id) => {
      peerId = id;
      done();
    });
  });

  beforeEach(async () => {
    block = new Block({ previousHash: '', blockNumber: 0, transactions: [] });
    await block.sign(peerId);
  });

  test('is valid', async () => {
    await expect(block.verify()).resolves.toBe(true);
  });

  test('is not valid with modified content', async () => {
    block.blockNumber = 1;
    await expect(block.verify()).resolves.toBe(false);
  });

  test('is not valid with modified hash', async () => {
    block.hash = 'hash';
    await expect(block.verify()).resolves.toBe(false);
  });

  test('is not valid with modified signature', async () => {
    block.signature = 'signature';
    await expect(block.verify()).resolves.toBe(false);
  });

  test('is valid with valid transaction', async () => {
    const transaction = new Transaction({ message: 'message' });
    await transaction.sign(peerId);
    block.transactions.push(transaction);
    await expect(block.verify()).resolves.toBe(false);
  });

  test('is not valid with invalid transaction', async () => {
    const transaction = new Transaction({ message: 'message' });
    await transaction.sign(peerId);
    transaction.message = 'hello';
    block.transactions.push(transaction);
    await expect(block.verify()).resolves.toBe(false);
  });

  test('hash and signature is ignored when calculating hash', () => {
    const hash1 = block.calculateHash();
    block.hash = 'hash';
    block.signature = 'signature';
    const hash2 = block.calculateHash();
    expect(hash1).toEqual(hash2);
  });
});
