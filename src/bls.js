const bls = require('bls-lib');

module.exports = {
  getShares: (numOfPlayers, threshold) => {
    return new Promise((resolve) => {
      bls.init();

      // set up master key share
      const masterSecretKey = [];
      const masterPublicKey = [];
      for (let i = 0; i < threshold; i++) {
        const sk = bls.secretKey();
        bls.secretKeySetByCSPRNG(sk);
        masterSecretKey.push(sk);

        const pk = bls.publicKey();
        bls.getPublicKey(pk, sk);

        masterPublicKey.push(pk);
      }

      // key sharing
      const ids = [];
      const secretKeys = [];
      const publicKeys = [];
      for (let i = 0; i < numOfPlayers; i++) {
        const id = bls.secretKey();
        bls.secretKeySetByCSPRNG(id);
        ids.push(id);

        const sk = bls.secretKey();
        bls.secretKeyShare(sk, masterSecretKey, id);
        secretKeys.push(sk);

        const pk = bls.publicKey();
        bls.publicKeyShare(pk, masterSecretKey, id);
        publicKeys.push(pk);
      }

      resolve({
        masterPublicKey: Buffer.from(bls.publicKeyExport(masterPublicKey[0])).toString('hex'),
        ids: ids.map(id => Buffer.from(bls.secretKeyExport(id)).toString('hex')),
        secretKeys: secretKeys.map(secretKey => Buffer.from(bls.secretKeyExport(secretKey)).toString('hex')),
        publicKeys: publicKeys.map(publicKey => Buffer.from(bls.publicKeyExport(publicKey)).toString('hex')),
      });
    });
  },

  sign: (message, secretKey) => {
    bls.init();
    const sig = bls.signature();
    const sk = bls.secretKey();
    bls.secretKeyDeserialize(sk, Buffer.from(secretKey, 'hex'));
    bls.sign(sig, sk, message);
    return Buffer.from(bls.signatureExport(sig)).toString('hex');
  },

  verify: (signature, publicKey, message) => {
    bls.init();
    const sig = bls.signature();
    bls.signatureDeserialize(sig, Buffer.from(signature, 'hex'));
    const pk = bls.publicKey();
    bls.publicKeyDeserialize(pk, Buffer.from(publicKey, 'hex'));
    return bls.verify(sig, pk, message);
  },

  recover: (sigs, ids) => {
    bls.init();
    const sig = bls.signature();
    const subSigs = sigs.map(sig => {
      const subSig = bls.signature();
      bls.signatureDeserialize(subSig, Buffer.from(sig, 'hex'));
      return subSig;
    });
    const subIds = ids.map(id => {
      const subId = bls.secretKey();
      bls.secretKeyDeserialize(subId, Buffer.from(id, 'hex'));
      return subId;
    });
    bls.signatureRecover(sig, subSigs, subIds);
    return Buffer.from(bls.signatureExport(sig)).toString('hex');
  },
};
