import type { Product } from './product';
import { Frame } from '@examples/multi-platform-product-shell';
import { Slot, SlotOwner } from '@react-cordis/renderer/react';

export function ProductView({ product, host }: { product: Product; host: string }) {
  return <Frame host={host}><SlotOwner owner={product.owner}><Slot name="root" /></SlotOwner></Frame>;
}
