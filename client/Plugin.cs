using BepInEx;
using BepInEx.Logging;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Threading.Tasks;
using ThatsBullshit.Patches;

namespace ThatsBullshit
{
    [BepInPlugin("com.floriandev.ThatsBullshit", "That's Bullshit!", "1.0.0")]
    public class Plugin : BaseUnityPlugin
	{
		public static Plugin Instance;
		public static ManualLogSource Log;

        private void Awake()
        {
            Instance = this;

            Log = Logger;
            Log.LogInfo("plugin loaded!");

            // enable patch
            new SessionExitScreenPatch().Enable();
            new SessionExitScreenAwakePatch().Enable();
        }
    }
}
