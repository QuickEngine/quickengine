# Changelog

## [0.2.0](https://github.com/QuickEngine/quickengine/compare/mod-payments-v0.1.0...mod-payments-v0.2.0) (2026-08-19)


### Features

* **api:** add invoicing and payments APIs ([#236](https://github.com/QuickEngine/quickengine/issues/236)) ([78844f1](https://github.com/QuickEngine/quickengine/commit/78844f16065e8832b4a971d9bb018a8f55275f6a))
* **api:** let a merchant site take an order and a payment ([#370](https://github.com/QuickEngine/quickengine/issues/370)) ([216ddea](https://github.com/QuickEngine/quickengine/commit/216ddea1e7db52c7872647c43137d7acbe15e003))
* **billing:** let customers buy credits and record who changed what ([#338](https://github.com/QuickEngine/quickengine/issues/338)) ([9e6714c](https://github.com/QuickEngine/quickengine/commit/9e6714cf711e8a9ed7bfb164a1c7e738a78cf7b4))
* **modules:** define first-action catalog ([#214](https://github.com/QuickEngine/quickengine/issues/214)) ([95c54a3](https://github.com/QuickEngine/quickengine/commit/95c54a34f633a033c7343630de81ba262b258ed6))
* **modules:** define guided first-action steps ([#220](https://github.com/QuickEngine/quickengine/issues/220)) ([a42595f](https://github.com/QuickEngine/quickengine/commit/a42595f0c8b004c7602c22f9940639e1985ce026))
* **orders:** let customers earn rewards for bringing new customers ([#382](https://github.com/QuickEngine/quickengine/issues/382)) ([7a045b4](https://github.com/QuickEngine/quickengine/commit/7a045b468ccf4020700c6288c3e739885c06fd6b))
* **orders:** show complete commerce operations ([#428](https://github.com/QuickEngine/quickengine/issues/428)) ([95bbf6f](https://github.com/QuickEngine/quickengine/commit/95bbf6f71b10c2716197595aabd87540d664b456))
* **payments:** add PayPal platform client ([#389](https://github.com/QuickEngine/quickengine/issues/389)) ([4916efb](https://github.com/QuickEngine/quickengine/commit/4916efb4d2e9b82459a54ec294baff94defb6608))
* **payments:** charge on the merchant's account, not the platform's ([#349](https://github.com/QuickEngine/quickengine/issues/349)) ([c4ae3b3](https://github.com/QuickEngine/quickengine/commit/c4ae3b35ad3e7df36568341f153114beea9aa2c1))
* **payments:** collect payments through a business's own PayPal ([#433](https://github.com/QuickEngine/quickengine/issues/433)) ([d2dc96c](https://github.com/QuickEngine/quickengine/commit/d2dc96c0c9e68f9fdd3a989dfc6492c5382eae0e))
* **payments:** connect merchant accounts in QuickDash ([#418](https://github.com/QuickEngine/quickengine/issues/418)) ([a3bed75](https://github.com/QuickEngine/quickengine/commit/a3bed75bd2bc98edd762b199a3981d2e8956f8ab))
* **payments:** connect PayPal checkout ([#390](https://github.com/QuickEngine/quickengine/issues/390)) ([c3493e8](https://github.com/QuickEngine/quickengine/commit/c3493e84f31d2e92143b43b68ab4afb2e4107be6))
* **payments:** isolate test and live commerce ([#417](https://github.com/QuickEngine/quickengine/issues/417)) ([38c0cd3](https://github.com/QuickEngine/quickengine/commit/38c0cd32c4d28be5fe7ca57d07be29c5d729f9c6))
* **payments:** keep multiple providers connected ([#391](https://github.com/QuickEngine/quickengine/issues/391)) ([692cd37](https://github.com/QuickEngine/quickengine/commit/692cd37ec727fddb459e59885aa07b4c0a8de504))
* **payments:** let a business connect the account it gets paid into ([#347](https://github.com/QuickEngine/quickengine/issues/347)) ([4376ee5](https://github.com/QuickEngine/quickengine/commit/4376ee52a21b96ccd0bc9c78a24cc05e7aba0994))
* **payments:** let a payment be recorded against its order ([#375](https://github.com/QuickEngine/quickengine/issues/375)) ([f2a4545](https://github.com/QuickEngine/quickengine/commit/f2a4545818163b507a23dcb010b207a65f580f12))
* **payments:** support provider-specific checkout actions ([#388](https://github.com/QuickEngine/quickengine/issues/388)) ([90eeda8](https://github.com/QuickEngine/quickengine/commit/90eeda84586a8f129d280f166fd41c5af0582014))
* **quickdash:** move freely between sandbox and live, and pay partners ([#437](https://github.com/QuickEngine/quickengine/issues/437)) ([c79e322](https://github.com/QuickEngine/quickengine/commit/c79e322af590301a77e68c2b51f4e1850fc0501b))
* **quickdash:** show what is loading, what is empty and what needs you ([#435](https://github.com/QuickEngine/quickengine/issues/435)) ([18300c9](https://github.com/QuickEngine/quickengine/commit/18300c9c58541de3abc9a31f83503bc4116263ac))
* **quickdash:** sort every record list ([#336](https://github.com/QuickEngine/quickengine/issues/336)) ([de871ef](https://github.com/QuickEngine/quickengine/commit/de871ef045e242ef609ef7c235d7c2d93934d935))
* **sdk:** connect custom frontends to QuickDash ([#392](https://github.com/QuickEngine/quickengine/issues/392)) ([ccb3d9b](https://github.com/QuickEngine/quickengine/commit/ccb3d9b1f29f343a1b9030c5e4ab54b93bb49fda))


### Bug Fixes

* **checkout:** commit paid orders completely ([#426](https://github.com/QuickEngine/quickengine/issues/426)) ([8cdb895](https://github.com/QuickEngine/quickengine/commit/8cdb895cba5d5c32e6870442d262b2920b9295bb))
* **ci:** stop failing tests that finished, just slowly ([#379](https://github.com/QuickEngine/quickengine/issues/379)) ([234fccb](https://github.com/QuickEngine/quickengine/commit/234fccbb05d4bd09be0e4bbb116c255c72670810))
* **payments:** check the balance when a payment is confirmed, not only when recorded ([#270](https://github.com/QuickEngine/quickengine/issues/270)) ([fdfac56](https://github.com/QuickEngine/quickengine/commit/fdfac567e93951a8ff1a814c74e71edfe974bd6c))
* **payments:** check the refund request before sending the money ([#422](https://github.com/QuickEngine/quickengine/issues/422)) ([90de135](https://github.com/QuickEngine/quickengine/commit/90de135c9d664e459ce114f49ae74a8ab9fc3467))
* **payments:** match a refund notification to its payment ([#423](https://github.com/QuickEngine/quickengine/issues/423)) ([6f24333](https://github.com/QuickEngine/quickengine/commit/6f24333e8c9f7c1c6c1c9eff5f80942b69ddfdd4))
* **payments:** preserve PayPal approval links ([#413](https://github.com/QuickEngine/quickengine/issues/413)) ([ae39701](https://github.com/QuickEngine/quickengine/commit/ae397019441576ba0aa265e9b05e0b722606cb97))
* **payments:** recognise a repeated provider notification instead of recording it twice ([#275](https://github.com/QuickEngine/quickengine/issues/275)) ([3732c87](https://github.com/QuickEngine/quickengine/commit/3732c872eb6a8b168189409e1e8c074e6fd7fa03))
* **payments:** request the Stripe capability needed to accept cards ([#420](https://github.com/QuickEngine/quickengine/issues/420)) ([cf79d0f](https://github.com/QuickEngine/quickengine/commit/cf79d0f0c392e250f41eff88368b906c335b09b0))
* **payments:** settle the payment when the provider confirms it ([#421](https://github.com/QuickEngine/quickengine/issues/421)) ([74d2f3f](https://github.com/QuickEngine/quickengine/commit/74d2f3f2b9ea68a832d86fa53d931b0f2ac450fc))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @quickengine/mod-invoicing bumped to 0.2.0
