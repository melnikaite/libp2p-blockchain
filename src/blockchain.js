const Block = require('./block');
const fs = require('fs');
const fsPromises = fs.promises;
const hash = require('object-hash');

class Blockchain {
  /**
   *
   * @param {Block[]} options.blocks
   */
  constructor(options = {}) {
    Object.assign(this, {
      storage: options.storage || './data/blockchain.json',
      blocks: options.blocks || [],
      state: options.state || { balances: {}, storage: {} },
      pendingTransactions: [],
      bls: options.bls || { signatures: {} },
    });
  }

  async addBlock(block, ignoreApplied) {
    const previousBlock = this.blocks[block.blockNumber - 1];
    if (previousBlock && block.previousHash !== previousBlock.calculateHash()) return false;

    return block.verify().then(isValid => {
      if (isValid) {
        return Promise.all(
          block.transactions
            .filter(t => !(ignoreApplied && t.signer === block.signer))
            .map(t => this.applyStateChanges(t))
        ).then(_ => {
          this.blocks[block.blockNumber] = block;
          // todo: use db to keep blocks and for updating data state
          return fsPromises.writeFile(this.storage, JSON.stringify(this.blocks, null, 2));
        }).catch(e => {
          console.log(e);
        });
      }
    });
  }

  getBlock(blockNumber = 'latest') {
    if (blockNumber === 'latest') blockNumber = this.blocks.length - 1;
    return this.blocks[blockNumber] || { hash: '', blockNumber: -1 };
  }

  savePendingTransactions(peerId) {
    const block = new Block({
      previousHash: this.getBlock().hash,
      blockNumber: this.getBlock().blockNumber + 1,
      transactions: this.pendingTransactions,
    });
    return block.sign(peerId)
      .then(_ => this.addBlock(block, true))
      .then(_ => this.pendingTransactions = [])
  }

  addTransaction(transaction) {
    return transaction.verify().then(isValid => {
      if (isValid) {
        return this.applyStateChanges(transaction).then(_ => {
          this.pendingTransactions.push(transaction);
        }).catch(e => {
          console.log(e);
        });
      }
    });
  }

  // try to apply state changes
  applyStateChanges(transaction) {
    return new Promise((resolve, reject) => {
      const originalState = JSON.stringify(this.state);
      try {
        if (!transaction.state) throw 'State is not defined';
        // change storage
        const originalHash = hash(this.state);
        if (transaction.state.storage) {
          this.state.storage = Object.assign(this.state.storage, transaction.state.storage);
        }
        // change balances
        if (transaction.state.balances) {
          Object.entries(transaction.state.balances).forEach((entries) => {
            const destination = entries[0];
            const amount = entries[1];
            if (!(amount > 0)) throw `Invalid amount for "${destination}": ${amount}`;
            if (this.state.balances[transaction.signer] < amount) throw `Insufficient balance of "${transaction.signer}": ${this.state.balances[transaction.signer]}`;
            this.state.balances[transaction.signer] -= amount;
            this.state.balances[destination] = this.state.balances[destination] + amount || amount;
          });
        }
        if (originalHash === hash(this.state)) throw 'State is not changed';
        resolve(true);
      } catch (e) {
        this.state = JSON.parse(originalState);
        reject({ error: 'Failed to add invalid transaction', transaction, e });
      }
    });
  }

  async verify() {
    let isValid = true;

    const validatedBlocks = await Promise.all(this.blocks.map(b => {
      const currentBlock = this.blocks[b.blockNumber];
      const previousBlock = this.blocks[b.blockNumber - 1];
      if (previousBlock && currentBlock.previousHash !== previousBlock.calculateHash()) return false;

      return b.verify();
    }));
    if (validatedBlocks.includes(false)) isValid = false;

    return isValid;
  }
}

module.exports = Blockchain;
