# Changelog

## [0.2.0](https://github.com/QuickEngine/quickengine/compare/mod-orders-v0.1.0...mod-orders-v0.2.0) (2026-08-07)


### Features

* **api:** add commerce operations APIs ([#239](https://github.com/QuickEngine/quickengine/issues/239)) ([727f173](https://github.com/QuickEngine/quickengine/commit/727f173b4d22a06f02da1fd9d32b0e8211b723b4))
* **api:** let a merchant site take an order and a payment ([#370](https://github.com/QuickEngine/quickengine/issues/370)) ([216ddea](https://github.com/QuickEngine/quickengine/commit/216ddea1e7db52c7872647c43137d7acbe15e003))
* **api:** let our users' users sign in and see their own records ([#342](https://github.com/QuickEngine/quickengine/issues/342)) ([0e4f84a](https://github.com/QuickEngine/quickengine/commit/0e4f84a0fd304876ca65c715850b2588778b1adb))
* **billing:** let customers buy credits and record who changed what ([#338](https://github.com/QuickEngine/quickengine/issues/338)) ([9e6714c](https://github.com/QuickEngine/quickengine/commit/9e6714cf711e8a9ed7bfb164a1c7e738a78cf7b4))
* **content:** let a business edit the words on its own website ([#376](https://github.com/QuickEngine/quickengine/issues/376)) ([885365f](https://github.com/QuickEngine/quickengine/commit/885365fa358865db33838ba3da56b66bb29ae800))
* **modules:** define first-action catalog ([#214](https://github.com/QuickEngine/quickengine/issues/214)) ([95c54a3](https://github.com/QuickEngine/quickengine/commit/95c54a34f633a033c7343630de81ba262b258ed6))
* **modules:** define guided first-action steps ([#220](https://github.com/QuickEngine/quickengine/issues/220)) ([a42595f](https://github.com/QuickEngine/quickengine/commit/a42595f0c8b004c7602c22f9940639e1985ce026))
* **orders:** hold stock when an order is placed so that the last item cannot sell twice ([#274](https://github.com/QuickEngine/quickengine/issues/274)) ([b87f87b](https://github.com/QuickEngine/quickengine/commit/b87f87bd18ed417c18b87ffd9f2b5ba7d046d936))
* **orders:** let a business run discount codes ([#381](https://github.com/QuickEngine/quickengine/issues/381)) ([9c96e25](https://github.com/QuickEngine/quickengine/commit/9c96e25f8d2c60b6c7f048b1765012b16ad984f7))
* **orders:** let an order carry tax ([#348](https://github.com/QuickEngine/quickengine/issues/348)) ([a4e878a](https://github.com/QuickEngine/quickengine/commit/a4e878abde87fb3f51f71464cfec723e48664e55))
* **orders:** let customers earn rewards for bringing new customers ([#382](https://github.com/QuickEngine/quickengine/issues/382)) ([7a045b4](https://github.com/QuickEngine/quickengine/commit/7a045b468ccf4020700c6288c3e739885c06fd6b))
* **quickdash:** sort every record list ([#336](https://github.com/QuickEngine/quickengine/issues/336)) ([de871ef](https://github.com/QuickEngine/quickengine/commit/de871ef045e242ef609ef7c235d7c2d93934d935))
* **shipping:** add delivery rates and checkout pricing ([#386](https://github.com/QuickEngine/quickengine/issues/386)) ([78155c6](https://github.com/QuickEngine/quickengine/commit/78155c60084500c4ea83cf2de6a38e26b2d5b92d))


### Bug Fixes

* **ci:** stop failing tests that finished, just slowly ([#379](https://github.com/QuickEngine/quickengine/issues/379)) ([234fccb](https://github.com/QuickEngine/quickengine/commit/234fccbb05d4bd09be0e4bbb116c255c72670810))
* **orders:** stop a used-up discount code from going through ([#397](https://github.com/QuickEngine/quickengine/issues/397)) ([d710f7b](https://github.com/QuickEngine/quickengine/commit/d710f7b0f7072633ffb8b751f3b5f8f5b345fe17))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @quickengine/mod-fulfillment bumped to 0.2.0
    * @quickengine/mod-inventory bumped to 0.2.0
    * @quickengine/mod-products-services bumped to 0.2.0
