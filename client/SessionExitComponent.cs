using System;

using EFT.UI;

using UnityEngine;
using UnityEngine.Events;
using UnityEngine.UI;

namespace ThatsBullshit;

public class SessionExitComponent : MonoBehaviour
{
	// ButtonsPanel: Vertical Layout Panel with Buttons
	private Transform verticalLayout;
	// HorizontalLayout: Horizontal Layout inside of buttonsPanel with Buttons
	private GameObject horizontalLayout;
	// ThatsBullshit: That's Bullshit! Button
	private Transform actionButton;

	public UnityAction buttonPress = OnButtonClick;

	// attach this Component to a GameObject
	public static void Attach(GameObject instance)
	{
		instance.AddComponent<SessionExitComponent>();
	}

	private void Awake()
	{
		PatchUI();
	}

	public void PatchUI()
	{
		try
		{
			var verticalLayoutPath = "ButtonsPanel";
			verticalLayout = this.transform.Find(verticalLayoutPath);
			if (verticalLayout is null)
			{
				throw new Exception($"{verticalLayoutPath} could not be found");
			}
			var mainMenuButtonPath = "ButtonsPanel/MainMenuButton";
			var mainMenuButton = this.transform.Find(mainMenuButtonPath);
			if (mainMenuButton is null)
			{
				throw new Exception($"{mainMenuButtonPath} could not be found");
			}
			var nextButtonPath = "ButtonsPanel/NextButton";
			var nextButton = this.transform.Find(nextButtonPath);
			if (nextButton is null)
			{
				throw new Exception("ButtonsPanel/NextButton could not be found");
			}

			// duplicate Button to create the ThatsBullshitButton from
			actionButton = GameObject.Instantiate(mainMenuButton, mainMenuButton.position, mainMenuButton.rotation, verticalLayout);
			if (actionButton is null)
			{
				throw new Exception("MainMenuButton could not be cloned");
			}
			actionButton.name = "ThatsBullshitButton";
			// get DefaultUIButtonDefaultUIButton Component
			var buttonComponent = actionButton.GetComponent<DefaultUIButton>();
			if (buttonComponent is null)
			{
				throw new Exception("DefaultUIButton Component of ThatsBullshitButton could not be found");
			}
			buttonComponent.SetHeaderText("That's Bullshit!");
			buttonComponent.SetEnabledTooltip("Give's you your loadout back.");
			// overwrite click handler
			buttonComponent.OnClick.RemoveAllListeners();
			buttonComponent.OnClick.AddListener(buttonPress);

			// create Horizontal Layout
			horizontalLayout = new GameObject("HorizontalLayout");
			var horizontalLayoutComp = horizontalLayout.AddComponent<HorizontalLayoutGroup>();
			if (horizontalLayoutComp is null)
			{
				throw new Exception("horizontalLayoutComp could not be created");
			}
			horizontalLayoutComp.spacing = 5;
			horizontalLayout.AddComponent<ContentSizeFitter>();
			// add Buttons to Horizontal Layout
			horizontalLayout.transform.SetParent(verticalLayout.transform, false);
			horizontalLayout.transform.SetSiblingIndex(0);
			actionButton.SetParent(horizontalLayout.transform, false);
			nextButton.SetParent(horizontalLayout.transform, false);
		}
		catch (Exception e)
		{
			Plugin.Log.LogError("SessionExitComponent.PatchUI: " + e.ToString());
		}
	}

	internal static void OnButtonClick()
	{
		Plugin.Log.LogInfo("Button Clicked");
		SPT.Common.Http.RequestHandler.PostJson("/thatsbullshit/keep", "{}");
	}
}