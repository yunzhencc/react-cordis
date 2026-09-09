import type { Product } from '@examples/multi-platform-shared';
import { Frame } from '@examples/multi-platform-product-shell';
import { bootProduct } from '@examples/multi-platform-shared';
import { ProductView } from '@examples/multi-platform-shared/react';
import { registerRootComponent } from 'expo';
import { useEffect, useState } from 'react';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Text } from 'tamagui';
import * as config from './boot.generated.js';

export default function App() {
  const [product, setProduct] = useState<Product>();
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const boot = bootProduct(config);
    void boot.then((value) => {
      if (active)
        setProduct(value);
    }).catch((reason) => {
      if (active)
        setError(String(reason));
    });
    return () => {
      active = false;
      void boot.then(value => value.dispose()).catch(console.error);
    };
  }, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1 }}>
        {product
          ? <ProductView product={product} host="React Native" />
          : <Frame host="React Native"><Text>{error || '…'}</Text></Frame>}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

registerRootComponent(App);
