import { concat, keccak256 } from "ethers";

export interface MerkleTree {
  root: string;
  layers: string[][];
}

/// Sorted-pair hashing, byte-for-byte compatible with OpenZeppelin's MerkleProof.verify.
export function hashPair(a: string, b: string): string {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  return left <= right ? keccak256(concat([left, right])) : keccak256(concat([right, left]));
}

export function buildMerkleTree(leaves: string[]): MerkleTree {
  if (leaves.length === 0) throw new Error("Merkle tree requires at least one leaf");

  const layers: string[][] = [leaves.map((leaf) => leaf.toLowerCase())];
  while (layers[layers.length - 1].length > 1) {
    const current = layers[layers.length - 1];
    const next: string[] = [];
    for (let i = 0; i < current.length; i += 2) {
      next.push(i + 1 < current.length ? hashPair(current[i], current[i + 1]) : current[i]);
    }
    layers.push(next);
  }

  return { root: layers[layers.length - 1][0], layers };
}

export function getProof(tree: MerkleTree, index: number): string[] {
  if (index < 0 || index >= tree.layers[0].length) throw new Error("Leaf index out of range");

  const proof: string[] = [];
  let cursor = index;
  for (let depth = 0; depth < tree.layers.length - 1; depth++) {
    const layer = tree.layers[depth];
    const sibling = cursor % 2 === 0 ? cursor + 1 : cursor - 1;
    if (sibling < layer.length) proof.push(layer[sibling]);
    cursor = Math.floor(cursor / 2);
  }
  return proof;
}

export function verifyMerkleProof(root: string, leaf: string, proof: string[]): boolean {
  let cursor = leaf.toLowerCase();
  for (const sibling of proof) cursor = hashPair(cursor, sibling);
  return cursor === root.toLowerCase();
}
