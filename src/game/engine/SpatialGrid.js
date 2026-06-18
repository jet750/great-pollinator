// Uniform spatial hash grid for broad-phase collision queries.
// Rebuilt every frame: clear() → insert(...) → retrieve(...).
// Replaces O(n²) entity iteration in the main loop.

export class SpatialGrid {
  constructor(worldWidth, worldHeight, cellSize = 200) {
    this.cellSize = cellSize;
    this.cols = Math.ceil(worldWidth / cellSize);
    this.rows = Math.ceil(worldHeight / cellSize);
    this.cells = new Map(); // key "col,row" → entity[]
  }

  _key(col, row) {
    return col * this.rows + row;
  }

  clear() {
    this.cells.clear();
  }

  /**
   * Insert an entity. Uses the entity's {x,y} and optional `radius` so an
   * entity straddling a cell boundary is registered in every cell it overlaps.
   */
  insert(entity) {
    const r = entity.radius || 0;
    const minCol = Math.max(0, Math.floor((entity.x - r) / this.cellSize));
    const maxCol = Math.min(this.cols - 1, Math.floor((entity.x + r) / this.cellSize));
    const minRow = Math.max(0, Math.floor((entity.y - r) / this.cellSize));
    const maxRow = Math.min(this.rows - 1, Math.floor((entity.y + r) / this.cellSize));
    for (let c = minCol; c <= maxCol; c++) {
      for (let row = minRow; row <= maxRow; row++) {
        const key = this._key(c, row);
        let bucket = this.cells.get(key);
        if (!bucket) {
          bucket = [];
          this.cells.set(key, bucket);
        }
        bucket.push(entity);
      }
    }
  }

  /** Return unique entities in all cells overlapping the query circle. */
  retrieve(x, y, radius = 0) {
    const minCol = Math.max(0, Math.floor((x - radius) / this.cellSize));
    const maxCol = Math.min(this.cols - 1, Math.floor((x + radius) / this.cellSize));
    const minRow = Math.max(0, Math.floor((y - radius) / this.cellSize));
    const maxRow = Math.min(this.rows - 1, Math.floor((y + radius) / this.cellSize));
    const found = [];
    const seen = new Set();
    for (let c = minCol; c <= maxCol; c++) {
      for (let row = minRow; row <= maxRow; row++) {
        const bucket = this.cells.get(this._key(c, row));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) {
          const e = bucket[i];
          if (!seen.has(e)) {
            seen.add(e);
            found.push(e);
          }
        }
      }
    }
    return found;
  }
}
