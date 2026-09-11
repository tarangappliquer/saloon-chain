# CreateIntentEndpointRequest


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**bookingId** | **number** |  | [default to undefined]
**provider** | **string** |  | [default to undefined]
**paymentMethod** | **string** |  | [optional] [default to 'card']
**currency** | **string** |  | [optional] [default to 'USD']
**amount** | **number** |  | [optional] [default to undefined]
**tipAmount** | **number** |  | [optional] [default to undefined]
**customerId** | **number** |  | [optional] [default to undefined]

## Example

```typescript
import { CreateIntentEndpointRequest } from './api';

const instance: CreateIntentEndpointRequest = {
    bookingId,
    provider,
    paymentMethod,
    currency,
    amount,
    tipAmount,
    customerId,
};
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
