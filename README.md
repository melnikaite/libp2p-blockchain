# libp2p-blockchain

## Run

1. `npm run peer0`

2. `npm run peer1`

3. `npm run peer2`

`curl -X POST -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"addTransaction","params":{"state":{"storage":{"key":"value"}}}}' localhost:3000`

`curl -X POST -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"get","params":["state","storage","key"]}' localhost:3001`

`curl -X POST -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"bls","params":{"message":"hello","numOfPlayers":3,"threshold":2}}' localhost:3000`

## Demo

https://www.youtube.com/embed/U2F97JgRYP4

https://monosnap.com/file/n9G8hwznAGPi50O33Dyzckjgl44xFs

https://www.youtube.com/watch?v=g2JcNDu6WJo
