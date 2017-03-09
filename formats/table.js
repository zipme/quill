import Parchment from 'parchment';
import Block, { BlockEmbed } from '../blots/block';
import Break from '../blots/break';
import Container from '../blots/container';

class TableCell extends Container {
  static create(value) {
    const node = super.create();
    const { tableId, rowId, cellId } = value;
    if (tableId) {
      node.setAttribute('data-table-id', tableId);
    }
    if (rowId) {
      node.setAttribute('data-row-id', rowId);
    }
    if (cellId) {
      node.setAttribute('data-cell-id', cellId);
    }
    return node;
  }

  static formats(node) {
    const tableId = node.hasAttribute('data-table-id') ? node.getAttribute('data-table-id') : null
    const rowId = node.hasAttribute('data-row-id') ? node.getAttribute('data-row-id') : null
    const cellId = node.hasAttribute('data-cell-id') ? node.getAttribute('data-cell-id') : null

    return {
      tableId,
      rowId,
      cellId,
    };
  }

  formats() {
    return { [this.statics.blotName]: this.statics.formats(this.domNode) };
  }

  formatAt(index, length, name, value) {
    // Pressing an enter key inside a table will try to insert a new line with `table-cell`,
    // `table-row` and `table` formats. Then after a new line is inserted, the existing code will
    // try to create each of those formats and we'd end up in each new line being wrapped into
    // cell->row->table blots (this is actually pretty much the same way a new table is inserted,
    // only the new line is not inserted by pressing an enter, but directly with delta insert).
    // Since we obviously don't want that happening when pressing enter inside a table as well, we
    // check here if the new line was being inserted in the table we're currently in, in which case
    // we don't let it propagate further. This ensures that all the other blots that have special
    // handling of the enter key function properly (eg. lists), as well as also ensuring that we can
    // easily insert a new table inside an already existing table since their tableId's will be
    // different.
    if (value && this.domNode.getAttribute('data-table-id') === value.tableId) {
      return
    }
    super.formatAt(index, length, name, value)
  }

  optimize() {
    // When inserting a new table, table-cell is the first blot that's created (well, after Block
    // blot) and what this optimize method does is making sure that each table-cell properly wraps
    // itself into a table-row if it's not already inside a table-row
    super.optimize();
    if (this.parent && this.parent.statics.blotName !== 'table-row') {
      const row = Parchment.create('table-row', this.statics.formats(this.domNode));
      this.parent.insertBefore(row, this);
      row.appendChild(this);
    }
  }

  replace(target) {
    // This method is called when inserting a new table (well, more specifically table-cell) and all
    // it does is takes the existing blot where the table is about to be inserted, moves its
    // children, if any, to the table-cell and replaces it with the block blot (which then gets
    // wrapped into table-cell).
    // Note: this does not mean that content that is selected when inserting a new table will be
    // moved into the table. That will be needed to handled specially if/when we want to do that.
    if (target.statics.blotName !== this.statics.blotName) {
      let item = Parchment.create(this.statics.defaultChild);
      target.moveChildren(item);
      this.appendChild(item);
    }
    super.replace(target)
  }
}
TableCell.blotName = 'table-cell';
TableCell.tagName = 'TD';
TableCell.scope = Parchment.Scope.BLOCK_BLOT;
TableCell.defaultChild = 'block';
TableCell.allowedChildren = [Block, BlockEmbed, Container, Break];

class TableRow extends Container {
  static create(value) {
    const node = super.create();
    const { tableId, rowId } = value;
    if (tableId) {
      node.setAttribute('data-table-id', tableId);
    }
    if (rowId) {
      node.setAttribute('data-row-id', rowId);
    }
    return node;
  }

  static formats(node) {
    const tableId = node.hasAttribute('data-table-id') ? node.getAttribute('data-table-id') : null
    const rowId = node.hasAttribute('data-row-id') ? node.getAttribute('data-row-id') : null

    return {
      tableId,
      rowId,
    };
  }

  formats() {
    // We don't inherit from FormatBlot
    return { [this.statics.blotName]: this.statics.formats(this.domNode) };
  }

  optimize() {
    // The purpose of optimize() method for table-row blot is twofold. First it makes sure if there
    // are two rows right next to each other with the same `rowId` value that it merges them
    // together, ie. it moves all the children from the second row into the first one and then
    // deletes the second. And secondly, it does the same thing the table-cell blot does, which is
    // it wraps itself into a table blot if it's not already in one.
    super.optimize();
    let next = this.next;
    if (next != null && next.prev === this &&
        next.statics.blotName === this.statics.blotName &&
        next.domNode.tagName === this.domNode.tagName &&
        next.domNode.getAttribute('data-row-id') === this.domNode.getAttribute('data-row-id')) {
      next.moveChildren(this);
      next.remove();
    }

    if (this.parent && this.parent.statics.blotName !== 'table') {
      const row = Parchment.create('table', this.statics.formats(this.domNode));
      this.parent.insertBefore(row, this);
      row.appendChild(this);
    }
  }
}
TableRow.blotName = 'table-row';
TableRow.tagName = 'TR';
TableRow.scope = Parchment.Scope.BLOCK_BLOT;
TableRow.defaultChild = 'table-cell';
TableRow.allowedChildren = [TableCell, Block, BlockEmbed, Container, Break];

class Table extends Container {
  static create(value) {
    const node = super.create();
    const { tableId } = value;
    if (tableId) {
      node.setAttribute('data-table-id', tableId);
    }
    return node;
  }

  static formats(node) {
    const tableId = node.hasAttribute('data-table-id') ? node.getAttribute('data-table-id') : null

    return {
      tableId,
    };
  }

  formats() {
    // We don't inherit from FormatBlot
    return { [this.statics.blotName]: this.statics.formats(this.domNode) };
  }

  optimize() {
    // Similarly to the table-row blot, optimize() method in the table blot merges the two tables
    // together if they have the same `tableId` value *or* if the two tables have the same number of
    // columns. The latter case handles situations where two different tables with the same number
    // of columns are separated by some content, and then if that content is removed, it will merge
    // the tables together.
    // TODO(2Pac): Discuss with others if the latter case is something that we'd actually want. It
    // might not make sense to merge two tables with different content together, even if they have
    // the same number of columns and it might not be something that the user actually wanted to do.
    // Especially until the undo/redo functionallity works properly with the tables.
    super.optimize();
    let next = this.next;
    const columnCount = (table) => table.children.head.children.length
    if (next != null && next.prev === this &&
        next.statics.blotName === this.statics.blotName &&
        next.domNode.tagName === this.domNode.tagName &&
        (next.domNode.getAttribute('data-table-id') === this.domNode.getAttribute('data-table-id') ||
        columnCount(next) === columnCount(this))) {
      next.moveChildren(this);
      next.remove();
    }
  }
}
Table.blotName = 'table';
Table.scope = Parchment.Scope.BLOCK_BLOT;
Table.tagName = 'TABLE';
Table.defaultChild = 'table-row';
Table.allowedChildren = [TableRow, TableCell, Block, BlockEmbed, Container, Break];

export { TableCell, TableRow, Table as default };
