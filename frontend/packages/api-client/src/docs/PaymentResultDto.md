# PaymentResultDto


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**success** | **boolean** |  | [default to undefined]
**paymentId** | **number** |  | [default to undefined]
**status** | [**PaymentStatus**](PaymentStatus.md) |  | [default to undefined]
**transactionId** | **string** |  | [default to undefined]
**errorMessage** | **string** |  | [default to undefined]
**checkoutUrl** | **string** |  | [optional] [default to undefined]

## Example

```typescript
import { PaymentResultDto } from './api';

const instance: PaymentResultDto = {
    success,
    paymentId,
    status,
    transactionId,
    errorMessage,
    checkoutUrl,
};
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
