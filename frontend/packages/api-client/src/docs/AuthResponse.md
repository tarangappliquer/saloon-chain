# AuthResponse


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**userId** | **number** |  | [default to undefined]
**name** | **string** |  | [default to undefined]
**email** | **string** |  | [default to undefined]
**role** | **string** |  | [default to undefined]
**token** | **string** |  | [default to undefined]
**canEmulate** | **boolean** |  | [optional] [default to false]
**isEmulated** | **boolean** |  | [optional] [default to false]
**emulatedByName** | **string** |  | [optional] [default to undefined]
**refreshToken** | **string** |  | [optional] [default to '']
**photoPath** | **string** |  | [optional] [default to undefined]
**isEmailVerified** | **boolean** |  | [optional] [default to false]
**emulatorChainId** | **number** |  | [optional] [default to undefined]
**emulatorLocationId** | **number** |  | [optional] [default to undefined]

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
    photoPath,
    isEmailVerified,
    emulatorChainId,
    emulatorLocationId,
};
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
