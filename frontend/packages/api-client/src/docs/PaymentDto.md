# PaymentDto


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**id** | **number** |  | [default to undefined]
**bookingId** | **number** |  | [default to undefined]
**amount** | **number** |  | [default to undefined]
**currency** | **string** |  | [default to undefined]
**provider** | **string** |  | [default to undefined]
**paymentMethod** | **string** |  | [default to undefined]
**status** | **string** |  | [default to undefined]
**transactionId** | **string** |  | [default to undefined]
**clientSecret** | **string** |  | [default to undefined]
**failureReason** | **string** |  | [default to undefined]
**createdBy** | **number** |  | [default to undefined]
**createdDate** | **string** |  | [default to undefined]
**tipAmount** | **number** |  | [optional] [default to 0]
**amountTendered** | **number** |  | [optional] [default to undefined]

## Example

```typescript
import { PaymentDto } from './api';

const instance: PaymentDto = {
    id,
    bookingId,
    amount,
    currency,
    provider,
    paymentMethod,
    status,
    transactionId,
    clientSecret,
    failureReason,
    createdBy,
    createdDate,
    tipAmount,
    amountTendered,
};
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
