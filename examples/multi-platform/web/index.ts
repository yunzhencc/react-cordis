import * as config from 'virtual:cordis-web';
import { mount } from './mount';

const boot = mount(config, 'Web');
window.addEventListener('pagehide', (event) => {
  if (!event.persisted)
    void boot.then(dispose => dispose());
});
