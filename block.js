const sha256 = require('crypto-js/sha256');
const PeerId = require('peer-id');

class Block {
  /**
   *
   * @param {string} options.previousHash
   * @param {number} options.blockNumber
   * @param {Transaction[]} options.transactions
   */
  constructor(options = {}) {
    Object.assign(this, options, { timestamp: Date.now() });
  }

  calculateHash() {
    const options = Object.entries(this).reduce((acc, val) => {
      if (!['hash', 'signature'].includes(val[0])) acc[val[0]] = val[1];
      return acc;
    }, {});
    return sha256(JSON.stringify(options)).toString();
  }

  async sign(peerId) {
    this.signer = peerId.toJSON().pubKey;
    this.hash = this.calculateHash();
    return new Promise((resolve, reject) => {
      peerId._privKey.sign(this.hash, (err, signature) => {
        if (err) return reject(err);
        this.signature = signature.toString('hex');
        resolve(true);
      });
    });
  }

  async verify() {
    let isValid = true;

    const peerId = await new Promise((resolve, reject) => {
      PeerId.createFromPubKey(this.signer, (err, id) => {
        if (err) return reject(err);
        resolve(id);
      });
    }).catch(_ => isValid = false);
    if (!isValid) return false;

    isValid = await new Promise((resolve, reject) => {
      peerId._pubKey.verify(this.calculateHash(), Buffer.from(this.signature, 'hex'), (err, res) => {
        if (err) return reject(err);
        resolve(res);
      });
    }).catch(_ => isValid = false);
    if (!isValid) return false;

    const validatedTxs = await Promise.all(this.transactions.map(tx => tx.verify()));
    if (validatedTxs.includes(false)) isValid = false;

    return isValid;
  }
}

module.exports = Block;
