const fs = require('fs');
const PeerId = require('peer-id');

PeerId.create((err, id) => {
  const peer = JSON.stringify(id.toJSON(), null, 2);

  if (process.argv[2]) {
    fs.writeFileSync(process.argv[2], peer)
  } else {
    console.log(peer)
  }
});
