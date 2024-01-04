const profiler = require('screeps-profiler');

class MinHeap {
  constructor(func) {
    this.heap = [null];
    this.func = func || (x => x)
  }

  getMin() {
    return this.heap[1];
  }

  getSize() {
    return this.heap.length - 1;
  }

  isEmpty() {
    return this.heap.length < 2;
  }

  insert(node) {
    const value = this.func(node)
    let current = this.heap.length;

    while (current > 1) {
      const parent = Math.floor(current / 2);
      if (this.func(this.heap[parent]) > value) {
        this.heap[current] = this.heap[parent];
        current = parent;
      } else break;
    }

    this.heap[current] = node;
  }

  remove() {
    let min = this.heap[1];

    if (this.heap.length > 2) {
      this.heap[1] = this.heap[this.heap.length - 1];
      this.heap.splice(this.heap.length - 1);

      let current = 1;
      let leftChildIndex = current * 2;
      let rightChildIndex = current * 2 + 1;

      while (this.heap[leftChildIndex]) {
        let childIndexToCompare = leftChildIndex;
        if (this.heap[rightChildIndex] && this.func(this.heap[rightChildIndex]) < this.func(this.heap[childIndexToCompare])) {
          childIndexToCompare = rightChildIndex;
        }

        if (this.func(this.heap[current]) > this.func(this.heap[childIndexToCompare])) {
          [this.heap[current], this.heap[childIndexToCompare]] = [
            this.heap[childIndexToCompare],
            this.heap[current],
          ];
          current = childIndexToCompare;
        } else break;

        leftChildIndex = current * 2;
        rightChildIndex = current * 2 + 1;
      }
    } else if (this.heap.length === 2) {
      this.heap.splice(1, 1);
    } else {
      return null;
    }

    return min;
  }
}

profiler.registerClass(MinHeap, 'MinHeap');

module.exports = MinHeap