import { DependencyContainer } from 'tsyringe';
import { StaticRouterModService } from '@spt/services/mod/staticRouter/StaticRouterModService';
import { Ixyz } from '@spt/models/eft/common/Ixyz';
import { KeepEquipment } from './keep';

export function setupRoutes(container: DependencyContainer) {
	const staticRouterModService = container.resolve<StaticRouterModService>(
		'StaticRouterModService'
	);
	const util = container.resolve<KeepEquipment>('KeepEquipment');

	interface AddSpawnRequest {
		map: string;
		position: Ixyz;
	}

	staticRouterModService.registerStaticRouter(
		'thatsbullshitkeep',
		[
			{
				url: '/thatsbullshit/keep',
				action: async (
					url: string,
					parameters: AddSpawnRequest,
					sessionID,
					output
				) => {
					//updateBotSpawn(overrideConfig.map, overrideConfig.position);
					return 'success';
				},
			},
		],
		'thatsbullshitkeep'
	);
	staticRouterModService.registerStaticRouter(
		'thatsbullshittest',
		[
			{
				url: '/thatsbullshit/test',
				action: async (
					url: string,
					parameters: AddSpawnRequest,
					sessionID,
					output
				) => {
					util.test(sessionID);
					return 'success';
				},
			},
		],
		'thatsbullshittest'
	);
}
