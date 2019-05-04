const sha256 = require('crypto-js/sha256');
const PeerId = require('peer-id');

class Transaction {
  constructor(options = {}) {
    // todo: should contain endpoint to execute and endpoint to verify execution (anyone in subchain should be able to verify)
    Object.assign(this, { timestamp: Date.now() }, options);
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

    if (this.hash !== this.calculateHash()) return false;

    const peerId = await new Promise((resolve, reject) => {
      PeerId.createFromPubKey(this.signer, (err, id) => {
        if (err) return reject(err);
        resolve(id);
      });
    }).catch(_ => isValid = false);
    if (!isValid) return false;

    await new Promise((resolve, reject) => {
      peerId._pubKey.verify(this.calculateHash(), Buffer.from(this.signature, 'hex'), (err, isValid) => {
        if (err || !isValid) return reject(err);
        resolve(isValid);
      });
    }).catch(_ => isValid = false);

    // todo: call verification endpoint

    return isValid;
  }
}

module.exports = Transaction;
