# AuthResponse


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**userId** | [**ApiBookingStreamGetLocationIdParameter**](ApiBookingStreamGetLocationIdParameter.md) |  | [default to undefined]
**name** | **string** |  | [default to undefined]
**email** | **string** |  | [default to undefined]
**role** | **string** |  | [default to undefined]
**token** | **string** |  | [default to undefined]
**canEmulate** | **boolean** |  | [optional] [default to false]
**isEmulated** | **boolean** |  | [optional] [default to false]
**emulatedByName** | **string** |  | [optional] [default to undefined]
**refreshToken** | **string** |  | [optional] [default to '']

## Example

```typescript
import { AuthResponse } from './api';

const instance: AuthResponse = {
    userId,
    name,
    email,
    role,
    token,
    canEmulate,
    isEmulated,
    emulatedByName,
    refreshToken,
};
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
