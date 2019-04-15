'use strict';

const TCP = require('libp2p-tcp');
const WS = require('libp2p-websockets');
const spdy = require('libp2p-spdy');
const KadDHT = require('libp2p-kad-dht');
const mplex = require('libp2p-mplex');
const secio = require('libp2p-secio');
const defaultsDeep = require('@nodeutils/defaults-deep');
const libp2p = require('libp2p');
const GossipDiscovery = require('libp2p-gossip-discovery');

function mapMuxers (list) {
  return list.map((pref) => {
    if (typeof pref !== 'string') {
      return pref
    }
    switch (pref.trim().toLowerCase()) {
      case 'spdy': return spdy;
      case 'mplex': return mplex;
      default:
        throw new Error(pref + ' muxer not available')
    }
  })
}

function getMuxers (muxers) {
  const muxerPrefs = process.env.LIBP2P_MUXER;
  if (muxerPrefs && !muxers) {
    return mapMuxers(muxerPrefs.split(','))
  } else if (muxers) {
    return mapMuxers(muxers)
  } else {
    return [mplex, spdy]
  }
}

class Node extends libp2p {
  constructor (_options) {
    const discovery = new GossipDiscovery(10);
    const defaults = {
      modules: {
        transport: [
          TCP,
          WS
        ],
        streamMuxer: getMuxers(_options.muxer),
        connEncryption: [ secio ],
        peerDiscovery: [ discovery ],
        dht: KadDHT
      },
      config: {
        peerDiscovery: {},
        dht: {
          kBucketSize: 20
        }
      }
    };

    super(defaultsDeep(_options, defaults));
    discovery.attach(this)
  }
}

module.exports = Node;
