# That's Bullshit!

A [SPT](https://sp-tarkov.com/) mod based on [Yet Another Keep Your Equipment Mod](https://hub.sp-tarkov.com/files/file/2162-yet-another-keep-your-equipment-mod/?highlight=keep), to keep your inventory after you died of some Bullshit.
It adds a button to the death screen, which when pressed gives back your equipment you brought into this round.

## Development

### Client

You will need Visual Studio 2022 and follow this [official Client Modding Quick Start Guide](https://hub.sp-tarkov.com/doc/entry/89-client-modding-quick-start-guide/) to setup your development environment.

### Server

You will need a version of [NodeJs](nodejs.org) `20.11` or newer, with the `npm` package manager (usually installed together with NodeJs). You should also follow this [official Client Modding Quick Start Guide](https://hub.sp-tarkov.com/doc/entry/89-client-modding-quick-start-guide/) to setup another instance of SPT for testing and development, to not damage your save files.

First install all dependencys with `npm install` and then run `npm run gen:types` to generate and copy all SPT types.
Now you should be setup to work on this repository!

To build and deploy the server mod, use `npm run dev`.
