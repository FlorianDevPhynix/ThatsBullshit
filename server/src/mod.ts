import { IPreSptLoadMod } from '@spt/models/external/IPreSptLoadMod';
import { DependencyContainer } from '@spt/models/external/tsyringe';
import { KeepEquipment } from './keep';
import { setupRoutes } from './routes';
import { KConfig } from './KConfig';
import { IPostDBLoadMod } from '@spt/models/external/IPostDBLoadMod';
import { DatabaseServer } from '@spt/servers/DatabaseServer';
import { InventoryHelper } from './InventoryHelper';

class Mod implements IPreSptLoadMod {
	private config: KConfig = require('../config/config');

	public preSptLoad(container: DependencyContainer): void {
		if (this.config.active) {
			container.register<KeepEquipment>('KeepEquipment', KeepEquipment);
			container.register('LocationLifecycleService', {
				useToken: 'KeepEquipment',
			});
			container.register<InventoryHelper>(
				'TBInventoryHelper',
				InventoryHelper
			);
			container.register('InventoryHelper', {
				useToken: 'TBInventoryHelper',
			});

			setupRoutes(container);
		}
	}
}

module.exports = { mod: new Mod() };
