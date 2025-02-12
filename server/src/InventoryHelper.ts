import { InventoryHelper as ParentHelper } from '@spt/helpers/InventoryHelper';
import { ContainerHelper } from '@spt/helpers/ContainerHelper';
import { DialogueHelper } from '@spt/helpers/DialogueHelper';
import { ItemHelper } from '@spt/helpers/ItemHelper';
import { PaymentHelper } from '@spt/helpers/PaymentHelper';
import { PresetHelper } from '@spt/helpers/PresetHelper';
import { ProfileHelper } from '@spt/helpers/ProfileHelper';
import { TraderAssortHelper } from '@spt/helpers/TraderAssortHelper';
import { IPmcData } from '@spt/models/eft/common/IPmcData';
import { IInventory } from '@spt/models/eft/common/tables/IBotBase';
import {
	IItem,
	IItemLocation,
	IUpd,
} from '@spt/models/eft/common/tables/IItem';
import { EquipmentSlots } from '@spt/models/enums/EquipmentSlots';
import { IAddItemDirectRequest } from '@spt/models/eft/inventory/IAddItemDirectRequest';
import { IAddItemsDirectRequest } from '@spt/models/eft/inventory/IAddItemsDirectRequest';
import { IInventoryMergeRequestData } from '@spt/models/eft/inventory/IInventoryMergeRequestData';
import { IInventoryMoveRequestData } from '@spt/models/eft/inventory/IInventoryMoveRequestData';
import { IInventoryRemoveRequestData } from '@spt/models/eft/inventory/IInventoryRemoveRequestData';
import { IInventorySplitRequestData } from '@spt/models/eft/inventory/IInventorySplitRequestData';
import { IInventoryTransferRequestData } from '@spt/models/eft/inventory/IInventoryTransferRequestData';
import { IItemEventRouterResponse } from '@spt/models/eft/itemEvent/IItemEventRouterResponse';
import {
	IInventoryConfig,
	IRewardDetails,
} from '@spt/models/spt/config/IInventoryConfig';
import { IOwnerInventoryItems } from '@spt/models/spt/inventory/IOwnerInventoryItems';
import { ILogger } from '@spt/models/spt/utils/ILogger';
import { ConfigServer } from '@spt/servers/ConfigServer';
import { DatabaseServer } from '@spt/servers/DatabaseServer';
import { FenceService } from '@spt/services/FenceService';
import { LocalisationService } from '@spt/services/LocalisationService';
import { HashUtil } from '@spt/utils/HashUtil';
import { HttpResponseUtil } from '@spt/utils/HttpResponseUtil';
import { ICloner } from '@spt/utils/cloners/ICloner';
import { inject, injectable } from 'tsyringe';

enum ItemLocation {
	// item location has not been looked up before
	Unknown,
	// item is in Stash
	Stash,
	// item is in Equipment
	Equipment,
}

interface ItemLookup {
	item: IItem;
	location: ItemLocation;
}

interface LookupConstants {
	equipmentId: string;
	questRaidItemsId: string;
	stashId: string;
	questStashItemsId: string;
	hideoutStashs: Set<string>;
}

@injectable()
export class InventoryHelper extends ParentHelper {
	constructor(
		@inject('PrimaryLogger') protected logger: ILogger,
		@inject('HashUtil') protected hashUtil: HashUtil,
		@inject('HttpResponseUtil') protected httpResponse: HttpResponseUtil,
		@inject('FenceService') protected fenceService: FenceService,
		@inject('DatabaseServer') protected databaseServer: DatabaseServer,
		@inject('PaymentHelper') protected paymentHelper: PaymentHelper,
		@inject('TraderAssortHelper')
		protected traderAssortHelper: TraderAssortHelper,
		@inject('DialogueHelper') protected dialogueHelper: DialogueHelper,
		@inject('ItemHelper') protected itemHelper: ItemHelper,
		@inject('ContainerHelper') protected containerHelper: ContainerHelper,
		@inject('ProfileHelper') protected profileHelper: ProfileHelper,
		@inject('PresetHelper') protected presetHelper: PresetHelper,
		@inject('LocalisationService')
		protected localisationService: LocalisationService,
		@inject('ConfigServer') protected configServer: ConfigServer,
		@inject('PrimaryCloner') protected cloner: ICloner
	) {
		super(
			logger,
			hashUtil,
			httpResponse,
			fenceService,
			databaseServer,
			paymentHelper,
			traderAssortHelper,
			dialogueHelper,
			itemHelper,
			containerHelper,
			profileHelper,
			presetHelper,
			localisationService,
			configServer,
			cloner
		);
	}

	/**
	 * recursive lookup of item and it'S parents
	 * @param itemId
	 * @param itemMap
	 * @param constants
	 * @returns
	 */
	protected lookupItem(
		itemId: string,
		itemMap: Map<string, ItemLookup>,
		constants: LookupConstants
	) {
		const lookupResult = itemMap.get(itemId);
		if (!lookupResult) {
			this.logger.error(
				'Item lookup failed unexpectedly: ' + JSON.stringify(itemId)
			);
			return ItemLocation.Unknown;
		}

		if (lookupResult.location !== ItemLocation.Unknown) {
			// location already known, lookup unnecessary
			return lookupResult.location;
		}

		// check item
		if (!lookupResult.item.parentId) {
			// item has no parent, impossible?
			this.logger.warning(
				'Item has no parent: ' + JSON.stringify(lookupResult)
			);
			return ItemLocation.Unknown;
		}
		if (
			lookupResult.item.slotId === EquipmentSlots.POCKETS ||
			lookupResult.item.parentId === constants.equipmentId ||
			lookupResult.item.parentId === constants.questRaidItemsId
		) {
			// equipment or pocket item, no parent lookup
			lookupResult.location = ItemLocation.Equipment;
			return ItemLocation.Equipment;
		}
		if (
			lookupResult.item.parentId === constants.stashId ||
			lookupResult.item.parentId === constants.questStashItemsId ||
			constants.hideoutStashs.has(lookupResult.item.parentId)
		) {
			//  stash, quest stash or hideout stash item, no parent lookup
			lookupResult.location = ItemLocation.Stash;
			return ItemLocation.Stash;
		}

		// lookup it's parents
		const parentLocation = this.lookupItem(
			lookupResult.item.parentId,
			itemMap,
			constants
		);
		lookupResult.location = parentLocation;
		return parentLocation;
	}

	public getEquipmentItems(inventory: IInventory) {
		// stash containers in hideout
		const hideoutStashs = new Set(
			Object.entries(inventory.hideoutAreaStashes).map(
				(entry) => entry[1]
			)
		);
		/* this.logger.info(
			'Hideout Stashs (' +
				hideoutStashs.size +
				'): ' +
				hideoutStashs.values()
		); */

		const itemMap = new Map<string, ItemLookup>(
			inventory.items.map((item) => [
				item._id,
				{
					item,
					location: ItemLocation.Unknown,
				},
			])
		);
		const constants: LookupConstants = {
			equipmentId: inventory.equipment,
			questRaidItemsId: inventory.questRaidItems,
			stashId: inventory.stash,
			questStashItemsId: inventory.questStashItems,
			hideoutStashs,
		};
		const equipmentItems = new Array<IItem>();
		// lookup each item
		for (const item of inventory.items) {
			const location = this.lookupItem(item._id, itemMap, constants);
			switch (location) {
				case ItemLocation.Stash:
					// not interested in this item, ignore
					break;

				case ItemLocation.Equipment:
					// interested in this item, add to list of equipment items
					equipmentItems.push(item);
					break;

				case ItemLocation.Unknown:
				default:
					// failure
					this.logger.warning(
						'item lookup failed: ' + JSON.stringify(item)
					);
					break;
			}
		}

		return equipmentItems;
	}
}
