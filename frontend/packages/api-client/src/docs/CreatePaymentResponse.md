# CreatePaymentResponse


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**paymentId** | **number** |  | [default to undefined]
**bookingId** | **number** |  | [default to undefined]
**amount** | **number** |  | [default to undefined]
**currency** | **string** |  | [default to undefined]
**provider** | [**PaymentProvider**](PaymentProvider.md) |  | [default to undefined]
**status** | [**PaymentStatus**](PaymentStatus.md) |  | [default to undefined]
**clientSecret** | **string** |  | [default to undefined]
**transactionId** | **string** |  | [default to undefined]
**publishableKey** | **string** |  | [default to undefined]
**checkoutUrl** | **string** |  | [optional] [default to undefined]
**tipAmount** | **number** |  | [optional] [default to 0]

## Example

```typescript
import { CreatePaymentResponse } from './api';

const instance: CreatePaymentResponse = {
    paymentId,
    bookingId,
    amount,
    currency,
    provider,
    status,
    clientSecret,
    transactionId,
    publishableKey,
    checkoutUrl,
    tipAmount,
};
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
