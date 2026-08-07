# Changelog

## [0.2.0](https://github.com/QuickEngine/quickengine/compare/mod-payments-v0.1.0...mod-payments-v0.2.0) (2026-08-07)


### Features

* **api:** add invoicing and payments APIs ([#236](https://github.com/QuickEngine/quickengine/issues/236)) ([78844f1](https://github.com/QuickEngine/quickengine/commit/78844f16065e8832b4a971d9bb018a8f55275f6a))
* **api:** let a merchant site take an order and a payment ([#370](https://github.com/QuickEngine/quickengine/issues/370)) ([216ddea](https://github.com/QuickEngine/quickengine/commit/216ddea1e7db52c7872647c43137d7acbe15e003))
* **billing:** let customers buy credits and record who changed what ([#338](https://github.com/QuickEngine/quickengine/issues/338)) ([9e6714c](https://github.com/QuickEngine/quickengine/commit/9e6714cf711e8a9ed7bfb164a1c7e738a78cf7b4))
* **modules:** define first-action catalog ([#214](https://github.com/QuickEngine/quickengine/issues/214)) ([95c54a3](https://github.com/QuickEngine/quickengine/commit/95c54a34f633a033c7343630de81ba262b258ed6))
* **modules:** define guided first-action steps ([#220](https://github.com/QuickEngine/quickengine/issues/220)) ([a42595f](https://github.com/QuickEngine/quickengine/commit/a42595f0c8b004c7602c22f9940639e1985ce026))
* **orders:** let customers earn rewards for bringing new customers ([#382](https://github.com/QuickEngine/quickengine/issues/382)) ([7a045b4](https://github.com/QuickEngine/quickengine/commit/7a045b468ccf4020700c6288c3e739885c06fd6b))
* **payments:** add PayPal platform client ([#389](https://github.com/QuickEngine/quickengine/issues/389)) ([4916efb](https://github.com/QuickEngine/quickengine/commit/4916efb4d2e9b82459a54ec294baff94defb6608))
* **payments:** charge on the merchant's account, not the platform's ([#349](https://github.com/QuickEngine/quickengine/issues/349)) ([c4ae3b3](https://github.com/QuickEngine/quickengine/commit/c4ae3b35ad3e7df36568341f153114beea9aa2c1))
* **payments:** connect PayPal checkout ([#390](https://github.com/QuickEngine/quickengine/issues/390)) ([c3493e8](https://github.com/QuickEngine/quickengine/commit/c3493e84f31d2e92143b43b68ab4afb2e4107be6))
* **payments:** keep multiple providers connected ([#391](https://github.com/QuickEngine/quickengine/issues/391)) ([692cd37](https://github.com/QuickEngine/quickengine/commit/692cd37ec727fddb459e59885aa07b4c0a8de504))
* **payments:** let a business connect the account it gets paid into ([#347](https://github.com/QuickEngine/quickengine/issues/347)) ([4376ee5](https://github.com/QuickEngine/quickengine/commit/4376ee52a21b96ccd0bc9c78a24cc05e7aba0994))
* **payments:** let a payment be recorded against its order ([#375](https://github.com/QuickEngine/quickengine/issues/375)) ([f2a4545](https://github.com/QuickEngine/quickengine/commit/f2a4545818163b507a23dcb010b207a65f580f12))
* **payments:** support provider-specific checkout actions ([#388](https://github.com/QuickEngine/quickengine/issues/388)) ([90eeda8](https://github.com/QuickEngine/quickengine/commit/90eeda84586a8f129d280f166fd41c5af0582014))
* **quickdash:** sort every record list ([#336](https://github.com/QuickEngine/quickengine/issues/336)) ([de871ef](https://github.com/QuickEngine/quickengine/commit/de871ef045e242ef609ef7c235d7c2d93934d935))
* **sdk:** connect custom frontends to QuickDash ([#392](https://github.com/QuickEngine/quickengine/issues/392)) ([ccb3d9b](https://github.com/QuickEngine/quickengine/commit/ccb3d9b1f29f343a1b9030c5e4ab54b93bb49fda))


### Bug Fixes

* **ci:** stop failing tests that finished, just slowly ([#379](https://github.com/QuickEngine/quickengine/issues/379)) ([234fccb](https://github.com/QuickEngine/quickengine/commit/234fccbb05d4bd09be0e4bbb116c255c72670810))
* **payments:** check the balance when a payment is confirmed, not only when recorded ([#270](https://github.com/QuickEngine/quickengine/issues/270)) ([fdfac56](https://github.com/QuickEngine/quickengine/commit/fdfac567e93951a8ff1a814c74e71edfe974bd6c))
* **payments:** recognise a repeated provider notification instead of recording it twice ([#275](https://github.com/QuickEngine/quickengine/issues/275)) ([3732c87](https://github.com/QuickEngine/quickengine/commit/3732c872eb6a8b168189409e1e8c074e6fd7fa03))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @quickengine/mod-invoicing bumped to 0.2.0
