# Changelog

## [0.2.0](https://github.com/QuickEngine/quickengine/compare/quick-v0.1.0...quick-v0.2.0) (2026-08-07)


### Features

* **api:** add bookings and time tracking APIs ([#244](https://github.com/QuickEngine/quickengine/issues/244)) ([29acbc3](https://github.com/QuickEngine/quickengine/commit/29acbc38f018546676fa49fd8136cf7f7ca91266))
* **api:** add commerce operations APIs ([#239](https://github.com/QuickEngine/quickengine/issues/239)) ([727f173](https://github.com/QuickEngine/quickengine/commit/727f173b4d22a06f02da1fd9d32b0e8211b723b4))
* **api:** add contracts, e-sign, files, and documents APIs ([#245](https://github.com/QuickEngine/quickengine/issues/245)) ([4d3e761](https://github.com/QuickEngine/quickengine/commit/4d3e761be443b649954b908c111ba0018a3f67d3))
* **api:** add durable client records API ([#228](https://github.com/QuickEngine/quickengine/issues/228)) ([ffeaf16](https://github.com/QuickEngine/quickengine/commit/ffeaf16a1f00743e8ae070ed95fcc83e204366a7))
* **api:** add invoicing and payments APIs ([#236](https://github.com/QuickEngine/quickengine/issues/236)) ([78844f1](https://github.com/QuickEngine/quickengine/commit/78844f16065e8832b4a971d9bb018a8f55275f6a))
* **api:** add products and services catalog API ([#234](https://github.com/QuickEngine/quickengine/issues/234)) ([9a1187c](https://github.com/QuickEngine/quickengine/commit/9a1187c1dd84fdcaa57e70918905731915ad57b1))
* **api:** add projects, milestones, and tasks APIs ([#243](https://github.com/QuickEngine/quickengine/issues/243)) ([f7ab1b0](https://github.com/QuickEngine/quickengine/commit/f7ab1b05a0ae467f70f1575735ab0486e32ad711))
* **api:** add quotes and estimates lifecycle API ([#235](https://github.com/QuickEngine/quickengine/issues/235)) ([416fd15](https://github.com/QuickEngine/quickengine/commit/416fd154e154332cfc71f69909c3812d4d6d373a))
* **api:** add reporting and analytics API ([#246](https://github.com/QuickEngine/quickengine/issues/246)) ([068d63d](https://github.com/QuickEngine/quickengine/commit/068d63da101a29acf5698dba80bd8abaefed00e5))
* **api:** document every response shape, and license the repository ([#265](https://github.com/QuickEngine/quickengine/issues/265)) ([9bb803b](https://github.com/QuickEngine/quickengine/commit/9bb803b51fd52bbe7c93072d383ae633a3e561e9))
* **api:** make the API contract explicit and versioned ([#263](https://github.com/QuickEngine/quickengine/issues/263)) ([88af37c](https://github.com/QuickEngine/quickengine/commit/88af37c2347240cd229e1f71955fc620e27aedca))
* **customers:** connect storefront identity ([#395](https://github.com/QuickEngine/quickengine/issues/395)) ([32ca2cc](https://github.com/QuickEngine/quickengine/commit/32ca2cc62c4ea84dbd2234f379328bd7924f7c8c))
* **customers:** open your account from the shop without signing in twice ([#396](https://github.com/QuickEngine/quickengine/issues/396)) ([bf467a8](https://github.com/QuickEngine/quickengine/commit/bf467a8f3735d160e21c525bb0abbdcfca98bd1a))
* **portal:** add private customer conversations ([#387](https://github.com/QuickEngine/quickengine/issues/387)) ([495348b](https://github.com/QuickEngine/quickengine/commit/495348b3214d383ca4398d9c14ad47be9434451f))
* **quickdash:** add the desktop app and rebuild the console layout ([#326](https://github.com/QuickEngine/quickengine/issues/326)) ([ea89e1c](https://github.com/QuickEngine/quickengine/commit/ea89e1cdc378acdf9174bc14729975a1235182b4))
* **quickdash:** migrate product app to Vite ([#300](https://github.com/QuickEngine/quickengine/issues/300)) ([3e2a6c7](https://github.com/QuickEngine/quickengine/commit/3e2a6c7ead5664fff3dbcb592756bb4ec56ebfe0))
* **sdk:** connect custom frontends to QuickDash ([#392](https://github.com/QuickEngine/quickengine/issues/392)) ([ccb3d9b](https://github.com/QuickEngine/quickengine/commit/ccb3d9b1f29f343a1b9030c5e4ab54b93bb49fda))
* **shipping:** add delivery rates and checkout pricing ([#386](https://github.com/QuickEngine/quickengine/issues/386)) ([78155c6](https://github.com/QuickEngine/quickengine/commit/78155c60084500c4ea83cf2de6a38e26b2d5b92d))
* **webhooks:** deliver workspace events to customer endpoints ([#253](https://github.com/QuickEngine/quickengine/issues/253)) ([665ff3a](https://github.com/QuickEngine/quickengine/commit/665ff3a3c3d6998dfb25409fc7d183e6c32982e7))


### Bug Fixes

* **apps:** stabilize the Vite migration ([#302](https://github.com/QuickEngine/quickengine/issues/302)) ([9924b9e](https://github.com/QuickEngine/quickengine/commit/9924b9e53d2e40073599ea4b18a5bfae2fa16874))
* **catalog:** expose safe storefront availability ([#393](https://github.com/QuickEngine/quickengine/issues/393)) ([43e6641](https://github.com/QuickEngine/quickengine/commit/43e6641a2c76c14655c13aa793b07c7bd074e97a))
* **ci:** stop failing tests that finished, just slowly ([#379](https://github.com/QuickEngine/quickengine/issues/379)) ([234fccb](https://github.com/QuickEngine/quickengine/commit/234fccbb05d4bd09be0e4bbb116c255c72670810))
* **connect:** make a key for your own server actually work ([#399](https://github.com/QuickEngine/quickengine/issues/399)) ([8996f48](https://github.com/QuickEngine/quickengine/commit/8996f481a3738070bdd3ce4fdd98b2cc3c383fcf))
* **quickdash:** complete deletion, sorting and rate limit reporting ([#337](https://github.com/QuickEngine/quickengine/issues/337)) ([33b9859](https://github.com/QuickEngine/quickengine/commit/33b98599f8d20b06a8cc8fa9f5ccf090e3f07829))
* **workspaces:** safely remove test data ([#321](https://github.com/QuickEngine/quickengine/issues/321)) ([e4b06fe](https://github.com/QuickEngine/quickengine/commit/e4b06fedfa5df0293dd6cbddc46b58550fddd94d))
