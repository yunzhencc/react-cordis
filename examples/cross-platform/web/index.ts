import { mount } from './mount';
import * as storage from './storage';

const boot = mount(storage, 'Web');
window.addEventListener('pagehide', (event) => {
  if (!event.persisted)
    void boot.then(dispose => dispose());
});
