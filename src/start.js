const PeerId = require('peer-id');
const PeerInfo = require('peer-info');
const Peer = require('./peer');

PeerId.createFromJSON(require(process.argv[2]), (err, id) => {
  if (err) throw err;

  const peerListener = new PeerInfo(id);

  if (process.argv[3]) {
    PeerId.createFromJSON({
      id: process.argv[3],
      pubKey: process.argv[4],
    }, (err, id) => {
      const bootstrapPeer = new PeerInfo(id);
      bootstrapPeer.multiaddrs.add(process.argv[5]);
      new Peer({ peerListener, bootstrapPeer });
    });
  } else {
    new Peer({ peerListener });
  }
});
