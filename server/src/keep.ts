import { ApplicationContext } from '@spt/context/ApplicationContext';
import { PlayerScavGenerator } from '@spt/generators/PlayerScavGenerator';
import { HealthHelper } from '@spt/helpers/HealthHelper';
import { InRaidHelper } from '@spt/helpers/InRaidHelper';
import { ProfileHelper } from '@spt/helpers/ProfileHelper';
import { QuestHelper } from '@spt/helpers/QuestHelper';
import { TraderHelper } from '@spt/helpers/TraderHelper';
import { ILogger } from '@spt/models/spt/utils/ILogger';
import { ConfigServer } from '@spt/servers/ConfigServer';
import { SaveServer } from '@spt/servers/SaveServer';
import { DatabaseService } from '@spt/services/DatabaseService';
import { InsuranceService } from '@spt/services/InsuranceService';
import { LocalisationService } from '@spt/services/LocalisationService';
import { MailSendService } from '@spt/services/MailSendService';
import { MatchBotDetailsCacheService } from '@spt/services/MatchBotDetailsCacheService';
import { PmcChatResponseService } from '@spt/services/PmcChatResponseService';
import { RandomUtil } from '@spt/utils/RandomUtil';
import { TimeUtil } from '@spt/utils/TimeUtil';
import { KConfig } from './KConfig';
import { EquipmentSlots } from '@spt/models/enums/EquipmentSlots';
import { IPmcData } from '@spt/models/eft/common/IPmcData';
import { LocationLifecycleService } from '@spt/services/LocationLifecycleService';
import { HashUtil } from '@spt/utils/HashUtil';
import { LocationLootGenerator } from '@spt/generators/LocationLootGenerator';
import { LootGenerator } from '@spt/generators/LootGenerator';
import { BotGenerationCacheService } from '@spt/services/BotGenerationCacheService';
import { BotLootCacheService } from '@spt/services/BotLootCacheService';
import { BotNameService } from '@spt/services/BotNameService';
import { RaidTimeAdjustmentService } from '@spt/services/RaidTimeAdjustmentService';
import { ICloner } from '@spt/utils/cloners/ICloner';
import { IEndLocalRaidRequestData } from '@spt/models/eft/match/IEndLocalRaidRequestData';
import { ItemHelper } from '@spt/helpers/ItemHelper';
import { InventoryHelper } from './InventoryHelper';
import { IQuestStatus } from '@spt/models/eft/common/tables/IBotBase';
import { IItem } from '@spt/models/eft/common/tables/IItem';
import { Traders } from '@spt/models/enums/Traders';
import { inject, injectable } from 'tsyringe';

interface IExitData {
	/** Player id */
	sessionId: string;
	/** Pmc profile */
	preRaidData: IPmcData;
	/** Scav profile */
	scavProfile: IPmcData;
}

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
export class KeepEquipment extends LocationLifecycleService {
	private config: KConfig = require('../config/config');

	/** Map of session id's to exit data */
	private exits: Map<string, IExitData> = new Map();

	constructor(
		@inject('PrimaryLogger') protected logger: ILogger,
		@inject('HashUtil') protected hashUtil: HashUtil,
		@inject('SaveServer') protected saveServer: SaveServer,
		@inject('TimeUtil') protected timeUtil: TimeUtil,
		@inject('RandomUtil') protected randomUtil: RandomUtil,
		@inject('ProfileHelper') protected profileHelper: ProfileHelper,
		@inject('DatabaseService') protected databaseService: DatabaseService,
		@inject('InRaidHelper') protected inRaidHelper: InRaidHelper,
		@inject('HealthHelper') protected healthHelper: HealthHelper,
		@inject('QuestHelper') protected questHelper: QuestHelper,
		@inject('MatchBotDetailsCacheService')
		protected matchBotDetailsCacheService: MatchBotDetailsCacheService,
		@inject('PmcChatResponseService')
		protected pmcChatResponseService: PmcChatResponseService,
		@inject('PlayerScavGenerator')
		protected playerScavGenerator: PlayerScavGenerator,
		@inject('TraderHelper') protected traderHelper: TraderHelper,
		@inject('LocalisationService')
		protected localisationService: LocalisationService,
		@inject('InsuranceService')
		protected insuranceService: InsuranceService,
		@inject('BotLootCacheService')
		protected botLootCacheService: BotLootCacheService,
		@inject('ConfigServer') protected configServer: ConfigServer,
		@inject('BotGenerationCacheService')
		protected botGenerationCacheService: BotGenerationCacheService,
		@inject('MailSendService') protected mailSendService: MailSendService,
		@inject('RaidTimeAdjustmentService')
		protected raidTimeAdjustmentService: RaidTimeAdjustmentService,
		@inject('BotNameService') protected botNameService: BotNameService,
		@inject('LootGenerator') protected lootGenerator: LootGenerator,
		@inject('ApplicationContext')
		protected applicationContext: ApplicationContext,
		@inject('LocationLootGenerator')
		protected locationLootGenerator: LocationLootGenerator,
		@inject('PrimaryCloner') protected cloner: ICloner,
		@inject('ItemHelper') protected itemHelper: ItemHelper,
		@inject('TBInventoryHelper') protected inventoryHelper: InventoryHelper
	) {
		super(
			logger,
			hashUtil,
			saveServer,
			timeUtil,
			randomUtil,
			profileHelper,
			databaseService,
			inRaidHelper,
			healthHelper,
			questHelper,
			matchBotDetailsCacheService,
			pmcChatResponseService,
			playerScavGenerator,
			traderHelper,
			localisationService,
			insuranceService,
			botLootCacheService,
			configServer,
			botGenerationCacheService,
			mailSendService,
			raidTimeAdjustmentService,
			botNameService,
			lootGenerator,
			applicationContext,
			locationLootGenerator,
			cloner
		);
	}

	protected override handlePostRaidPmc(
		sessionId: string,
		preRaidData: IPmcData,
		scavProfile: IPmcData,
		isDead: boolean,
		isSurvived: boolean,
		isTransfer: boolean,
		request: IEndLocalRaidRequestData,
		locationName: string
	): void {
		const preRaidDataClone = this.cloner.clone(preRaidData);
		// store raid exit data, for later use
		this.exits.set(sessionId, {
			sessionId,
			preRaidData: preRaidDataClone,
			scavProfile,
		});

		super.handlePostRaidPmc(
			sessionId,
			preRaidData,
			scavProfile,
			isDead,
			isSurvived,
			isTransfer,
			request,
			locationName
		);
	}

	public resetAfterExit(sessionId: string) {
		const { preRaidData, scavProfile } = this.exits.get(sessionId);

		const postRaidProfile = this.profileHelper.getPmcProfile(sessionId);
		this.updateProfile(
			preRaidData,
			postRaidProfile,
			sessionId,
			preRaidData.Quests
		);

		const lostQuestItems =
			this.profileHelper.getQuestItemsInProfile(postRaidProfile);
		this.updateInventory(
			preRaidData,
			postRaidProfile,
			sessionId,
			lostQuestItems
		);

		this.mergePmcAndScavEncyclopedias(preRaidData, scavProfile);

		if (this.config.saveVitality) {
			this.healthHelper.updateProfileHealthPostRaid(
				preRaidData,
				postRaidProfile.Health,
				sessionId,
				true
			);
		}
	}

	/**
	 * recursive lookup of item and it'S parents
	 * @param itemId
	 * @param itemMap
	 * @param constants
	 * @returns
	 */
	private lookupItem(
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

	public test(sessionId: string) {
		const profile = this.profileHelper.getPmcProfile(sessionId);

		this.logger.info('Items: ' + profile.Inventory.items.length);
		console.time('equipment filter');
		// stash containers in hideout
		/* const hideoutStashs = new Set(
			Object.entries(profile.Inventory.hideoutAreaStashes).map(
				(entry) => entry[1]
			)
		);
		this.logger.info(
			'Hideout Stashs (' +
				hideoutStashs.size +
				'): ' +
				hideoutStashs.values()
		); */
		const equipmentItems = this.inventoryHelper.getEquipmentItems(
			profile.Inventory
		);
		console.timeEnd('equipment filter');

		this.logger.info('Equipment items: ' + equipmentItems.length);
		this.logger.info('------------------------');
		for (const item of equipmentItems) {
			this.logger.info(this.itemHelper.getItemName(item._tpl));
		}
		this.logger.info('------------------------');

		//this.logger.info(JSON.stringify(items));
		const backpack = profile.Inventory.items.find(
			(value) => value.slotId === EquipmentSlots.BACKPACK
		);
		this.logger.info(JSON.stringify(backpack));
		this.logger.info(this.itemHelper.getItemName(backpack._tpl));

		const backpackItems = profile.Inventory.items.filter(
			(item) => item.parentId === backpack._id
		);
		backpackItems.push(backpack);
		this.logger.info('Container items (' + backpackItems.length + '): ');
		/* for (const item of backpackItems) {
			this.logger.info(JSON.stringify(item));
		} */

		const [width, height] = this.inventoryHelper.getItemSize(
			backpack._tpl,
			backpack._id,
			backpackItems
		);

		class FixedSizeArray<T> {
			private values: T[];

			public get length(): number {
				return this.size;
			}

			constructor(size: number);
			constructor(size: number, defaultValue: T);
			constructor(private size: number, defaultValue?: T) {
				this.values = new Array(size);
				if (defaultValue) {
					for (let i = 0; i < size; i++) {
						this.values[i] = defaultValue;
					}
				}
			}

			public value(index: number): T {
				if (index < 0 || this.size <= index) {
					throw new Error('index out of range');
				}
				return this.values[index];
			}

			public toString(): string {
				return JSON.stringify(this.values);
			}
		}
		this.logger.info('width: ' + width + '; height: ' + height);
		const backpackMap = new FixedSizeArray(
			width,
			new FixedSizeArray<IItem | 0>(height, 0)
		);
		for (const item of backpackItems.filter(
			(item) => item._id !== backpack._id
		)) {
			if (typeof item.location === 'number') {
				//backpackMap.value(item.location);
				this.logger.error('Did not expect number' + item.location);
			} else {
				const itemItems = profile.Inventory.items.filter(
					(child) => child.parentId === item._id
				);
				itemItems.push(item);
				const [itemWidth, itemHeight] =
					this.inventoryHelper.getItemSize(
						item._tpl,
						item._id,
						itemItems
					);
				this.logger.info(
					`Item: x=${item.location.x} y=${item.location.y} r=${item.location.r} width=${itemWidth} height=${itemHeight}`
				);
			}
		}
		/* const containerMap = this.inventoryHelper.getContainerMap(
			width,
			height,
			backpackItems,
			backpack._id
		);
		for (const element of containerMap) {
			this.logger.info(JSON.stringify(element));
		} */
	}

	private updateInventory(
		preRaidData: IPmcData,
		postRaidData: IPmcData,
		sessionID: string,
		lostQuestItems: IItem[]
	) {
		if (!this.config.keepQuestItems) {
			for (const item of lostQuestItems) {
				/* this.inventoryHelper.getContainerMap;
				postRaidData.Inventory.questRaidItems;
				this.inventoryHelper.placeItemInContainer(); */
				this.inventoryHelper.removeItem(
					postRaidData,
					item._id,
					sessionID
				);
			}

			this.checkForAndFixPickupQuestsAfterDeath(
				sessionID,
				lostQuestItems,
				preRaidData.Quests
			);
		}

		postRaidData.Inventory.items = this.itemHelper.replaceIDs(
			postRaidData.Inventory.items,
			postRaidData,
			postRaidData.InsuredItems,
			postRaidData.Inventory.fastPanel
		);

		if (this.config.keepItemsFoundInRaid) {
			this.inRaidHelper.setInventory(
				sessionID,
				preRaidData,
				postRaidData,
				this.config.retainFoundInRaidStatus,
				false
			);
		} else if (this.config.keepItemsInSecureContainer) {
			const securedContainer = this.getSecuredContainerAndChildren(
				postRaidData.Inventory.items
			);

			if (securedContainer) {
				preRaidData =
					this.profileHelper.removeSecureContainer(preRaidData);
				preRaidData.Inventory.items =
					preRaidData.Inventory.items.concat(securedContainer);
			}
		}

		if (!this.config.retainFoundInRaidStatus) {
			this.inRaidHelper.removeFiRStatusFromItemsInContainer(
				sessionID,
				preRaidData,
				preRaidData.Inventory.equipment
			);
		}
	}

	private getSecuredContainerAndChildren(
		items: IItem[]
	): IItem[] | undefined {
		const secureContainer = items.find(
			(x) => x.slotId === EquipmentSlots.SECURED_CONTAINER
		);
		if (secureContainer) {
			return this.itemHelper.findAndReturnChildrenAsItems(
				items,
				secureContainer._id
			);
		}

		return undefined;
	}

	private updateProfile(
		preRaidData: IPmcData,
		postRaidData: IPmcData,
		sessionID: string,
		dataClone: IQuestStatus[]
	): void {
		// Resets skill fatigue
		for (const skill of postRaidData.Skills.Common) {
			skill.PointsEarnedDuringSession = 0.0;
		}

		// Level
		if (this.config.profileSaving.level) {
			preRaidData.Info.Level = postRaidData.Info.Level;
		}

		// Skills
		if (this.config.profileSaving.skills) {
			preRaidData.Skills = postRaidData.Skills;
		}

		// Stats
		if (this.config.profileSaving.stats) {
			preRaidData.Stats.Eft = postRaidData.Stats.Eft;
		}

		// Encyclopedia
		if (this.config.profileSaving.encyclopedia) {
			preRaidData.Encyclopedia = postRaidData.Encyclopedia;
		}

		// Quest progress
		if (
			this.config.profileSaving.questProgress ||
			!this.config.keepQuestItems
		) {
			preRaidData.TaskConditionCounters =
				postRaidData.TaskConditionCounters;
			preRaidData.Quests = this.processPostRaidQuests(
				postRaidData.Quests
			);

			this.lightkeeperQuestWorkaround(
				sessionID,
				postRaidData.Quests,
				dataClone,
				preRaidData
			);
		}

		// Survivor class
		if (this.config.profileSaving.survivorClass) {
			preRaidData.SurvivorClass = postRaidData.SurvivorClass;
		}

		preRaidData.WishList = postRaidData.WishList;

		// Experience
		if (this.config.profileSaving.experience) {
			preRaidData.Info.Experience +=
				preRaidData.Stats.Eft.TotalSessionExperience;
		}

		this.applyTraderStandingAdjustments(
			preRaidData.TradersInfo,
			postRaidData.TradersInfo
		);

		preRaidData.Stats.Eft.TotalSessionExperience = 0;
	}
}
