const PeerId = require('peer-id');
const PeerInfo = require('peer-info');
const Peer = require('./peer');
const minimist = require('minimist');

(async () => {
  const options = {};
  const argv = minimist(process.argv.slice(2));

  options.peerPort = argv['peer-port'];
  options.rpcPort = argv['rpc-port'];

  const id = await new Promise((resolve, reject) => {
    PeerId.createFromJSON(require(argv['peer-key']), (err, id) => {
      if (err) return reject(err);
      resolve(id);
    });
  });
  options.peerListener = new PeerInfo(id);

  if (argv['boot-peer-pubkey']) {
    const bootId = await new Promise((resolve, reject) => {
      PeerId.createFromPubKey(argv['boot-peer-pubkey'], (err, id) => {
        if (err) return reject(err);
        resolve(id);
      });
    });
    options.bootstrapPeer = new PeerInfo(bootId);
    options.bootstrapPeer.multiaddrs.add(argv['boot-peer-addr']);
  }

  new Peer(options);
})();
