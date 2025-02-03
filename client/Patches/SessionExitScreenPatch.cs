using EFT;
using EFT.UI.SessionEnd;

using HarmonyLib;

using SPT.Reflection.Patching;

using System;
using System.Reflection;

namespace ThatsBullshit.Patches
{
	internal class SessionExitScreenPatch : ModulePatch // all patches must inherit ModulePatch
	{
		protected override MethodBase GetTargetMethod()
		{
			return AccessTools.Method(typeof(SessionResultExitStatus), nameof(SessionResultExitStatus.Show), [
				typeof(Profile), typeof(GClass1917), typeof(ESideType), typeof(ExitStatus), typeof(TimeSpan), typeof(ISession), typeof(bool)
			]);
		}

		[PatchPostfix]
		static void Postfix(SessionResultExitStatus __instance, /*Profile activeProfile, GClass1917 lastPlayerState, */ESideType side, ExitStatus exitStatus/*, ISession session*/)
		{
			if (exitStatus != ExitStatus.Survived && exitStatus != ExitStatus.Transit && side == ESideType.Pmc)
			{
				Plugin.Log.LogInfo("That's Bullshit! is active");
				SessionExitComponent.Attach(__instance.gameObject);
			}

			/*try
			{
				var data = Newtonsoft.Json.JsonConvert.SerializeObject(activeProfile.Inventory.Equipment.AllSlots,
					new Newtonsoft.Json.JsonSerializerSettings()
					{
						Formatting = Newtonsoft.Json.Formatting.Indented,
						ReferenceLoopHandling = Newtonsoft.Json.ReferenceLoopHandling.Serialize,
						MaxDepth = 6,
						*//*Error = delegate (object sender, Newtonsoft.Json.Serialization.ErrorEventArgs args)
						{
							args.ErrorContext.Handled = true;
						},*//*

					}
				);
				System.IO.File.WriteAllText(@"equipment.json", data);
			}
			catch (Exception e)
			{
				Plugin.Log.LogError(e);
				throw;
			}*/
		}
	}

	// this class exists only for testing purposes
	internal class SessionExitScreenAwakePatch : ModulePatch
	{
		protected override MethodBase GetTargetMethod()
		{
			return AccessTools.Method(typeof(SessionResultExitStatus), nameof(SessionResultExitStatus.Awake));

		}

		[PatchPrefix]
		static bool Prefix(SessionResultExitStatus __instance)
		{
			SessionExitComponent.Attach(__instance.gameObject);

			return true;
		}
	}
}
