const Block = require('./block');

class Blockchain {
  /**
   *
   * @param {Block[]} options.blocks
   */
  constructor(options = {}) {
    Object.assign(this, { blocks: options.blocks || [], pendingTransactions: [] });
  }

  addBlock(block) {
    return block.verify().then(isValid => {
      if (isValid) this.blocks[block.blockNumber] = block;
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
      .then(_ => this.addBlock(block))
      .then(_ => this.pendingTransactions = [])
  }

  addTransaction(transaction) {
    return transaction.verify().then(isValid => {
      if (isValid) this.pendingTransactions.push(transaction);
    });
  }

  async verify() {
    let isValid = true;

    const validatedBlocks = await Promise.all(this.blocks.map(b => {
      const currentBlock = this.blocks[b.blockNumber];
      const previousBlock = this.blocks[b.blockNumber - 1];

      if (previousBlock && currentBlock.previousHash !== previousBlock.calculateHash()) return false;
      if (currentBlock.hash !== currentBlock.calculateHash()) return false;

      return b.verify();
    }));
    if (validatedBlocks.includes(false)) isValid = false;

    return isValid;
  }
}

module.exports = Blockchain;
